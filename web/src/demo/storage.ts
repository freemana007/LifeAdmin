import type { Deadline, Doc } from "../api";
import { runtime } from "./runtime";

export interface Profile {
  name: string;
  email: string;
  householdName: string;
  plan: "free" | "premium";
  createdAt: string;
}

export interface StoredDoc {
  document: Doc & { text: string; example?: boolean };
  deadlines: Deadline[];
}

export interface Backend {
  readonly kind: "account" | "device";
  getProfile(): Promise<Profile | null>;
  putProfile(p: Profile): Promise<void>;
  listDocs(): Promise<StoredDoc[]>;
  putDoc(d: StoredDoc): Promise<void>;
  deleteDoc(id: string): Promise<void>;
}

const LS_KEY = "lifeadmin.demo.v1";

/** Fallback: this browser only. Every access is guarded; private windows can refuse storage. */
class DeviceBackend implements Backend {
  readonly kind = "device" as const;
  private mem: { profile: Profile | null; docs: Record<string, StoredDoc> } = { profile: null, docs: {} };

  constructor() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) this.mem = JSON.parse(raw);
    } catch {
      /* start empty */
    }
  }
  private save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(this.mem));
    } catch {
      /* memory only for this visit */
    }
  }
  async getProfile() {
    return this.mem.profile;
  }
  async putProfile(p: Profile) {
    this.mem.profile = p;
    this.save();
  }
  async listDocs() {
    return Object.values(this.mem.docs);
  }
  async putDoc(d: StoredDoc) {
    this.mem.docs[d.document.id] = d;
    this.save();
  }
  async deleteDoc(id: string) {
    delete this.mem.docs[id];
    this.save();
  }
}

/** Private per-person storage in the artifact's database (data/users/<id>/...). */
class AccountBackend implements Backend {
  readonly kind = "account" as const;
  constructor(private readonly col: ReturnType<import("./runtime").DbLike["collection"]>) {}

  async getProfile() {
    const snap = await this.col.doc("profile").get();
    return snap.exists ? (snap.data() as unknown as Profile) : null;
  }
  async putProfile(p: Profile) {
    await this.col.doc("profile").set({ ...p });
  }
  async listDocs() {
    const snap = await this.col.get();
    return snap.docs.filter((d) => d.id.startsWith("doc-")).map((d) => d.data() as unknown as StoredDoc);
  }
  async putDoc(d: StoredDoc) {
    // Stay well under the 256 KiB document limit.
    const text = d.document.text.length > 60_000 ? d.document.text.slice(0, 60_000) : d.document.text;
    await this.col.doc(`doc-${d.document.id}`).set(JSON.parse(JSON.stringify({ ...d, document: { ...d.document, text } })));
  }
  async deleteDoc(id: string) {
    await this.col.doc(`doc-${id}`).delete();
  }
}

/**
 * Uses the account store until a write is refused (for example a viewer who
 * can only view this page), then moves everything to this browser and
 * carries on there.
 */
class FallbackBackend implements Backend {
  private device: DeviceBackend | null = null;
  constructor(private readonly account: AccountBackend) {}
  get kind() {
    return this.device ? ("device" as const) : ("account" as const);
  }
  private async write(fn: (b: Backend) => Promise<void>) {
    if (!this.device) {
      try {
        return await fn(this.account);
      } catch {
        const device = new DeviceBackend();
        const [profile, docs] = await Promise.all([this.account.getProfile().catch(() => null), this.account.listDocs().catch(() => [])]);
        if (profile && !(await device.getProfile())) await device.putProfile(profile);
        for (const d of docs) await device.putDoc(d);
        this.device = device;
      }
    }
    return fn(this.device!);
  }
  getProfile() {
    return (this.device ?? this.account).getProfile();
  }
  listDocs() {
    return (this.device ?? this.account).listDocs();
  }
  putProfile(p: Profile) {
    return this.write((b) => b.putProfile(p));
  }
  putDoc(d: StoredDoc) {
    return this.write((b) => b.putDoc(d));
  }
  deleteDoc(id: string) {
    return this.write((b) => b.deleteDoc(id));
  }
}

let backend: Promise<Backend> | null = null;

export function getBackend(): Promise<Backend> {
  backend ??= (async () => {
    const [db, user] = await Promise.all([runtime.db(), runtime.user()]);
    const id = user ? await user.id().catch(() => null) : null;
    if (db && id) {
      const account = new AccountBackend(db.collection(`data/users/${id}`));
      try {
        await account.getProfile();
        return new FallbackBackend(account);
      } catch {
        /* not allowed to use the database in this view */
      }
    }
    return new DeviceBackend();
  })();
  return backend;
}

export async function viewerName(): Promise<string> {
  const user = await runtime.user();
  if (!user) return "";
  try {
    return (await user.me()).name || "";
  } catch {
    return "";
  }
}
