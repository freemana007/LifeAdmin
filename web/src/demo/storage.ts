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

/** A save that failed, with the store's code so the screen can say why. */
export class StorageError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const LS_KEY = "lifeadmin.demo.v1";
const MODE_KEY = "lifeadmin.demo.mode";

/**
 * Data read from the runtime can be frozen (read-only). Everything that leaves
 * this module is a deep, plain copy so callers can change it freely.
 */
const clone = <T>(v: T): T => (v == null ? v : (JSON.parse(JSON.stringify(v)) as T));

function readMode(): "device" | null {
  try {
    return localStorage.getItem(MODE_KEY) === "device" ? "device" : null;
  } catch {
    return null;
  }
}
function writeMode(mode: "device" | null) {
  try {
    if (mode) localStorage.setItem(MODE_KEY, mode);
    else localStorage.removeItem(MODE_KEY);
  } catch {
    /* best effort */
  }
}

// ---------- Notices for the UI ----------

type Listener = (message: string) => void;
const listeners = new Set<Listener>();
let lastNotice: string | null = null;
export function onStorageNotice(fn: Listener): () => void {
  listeners.add(fn);
  if (lastNotice) fn(lastNotice);
  return () => listeners.delete(fn);
}
function notice(message: string) {
  lastNotice = message;
  for (const fn of listeners) fn(message);
}

// ---------- This browser ----------

/** This browser only. Every access is guarded; private windows can refuse storage. */
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
    return clone(this.mem.profile);
  }
  async putProfile(p: Profile) {
    this.mem.profile = clone(p);
    this.save();
  }
  async listDocs() {
    return clone(Object.values(this.mem.docs));
  }
  async putDoc(d: StoredDoc) {
    this.mem.docs[d.document.id] = clone(d);
    this.save();
  }
  async deleteDoc(id: string) {
    delete this.mem.docs[id];
    this.save();
  }
  clear() {
    this.mem = { profile: null, docs: {} };
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* ignore */
    }
  }
}

// ---------- The person's claude.ai account ----------

type Col = ReturnType<import("./runtime").DbLike["collection"]>;
const codeOf = (e: unknown) => (e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "unknown");
const TRANSIENT = new Set(["unavailable", "resource_exhausted"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Private per-person storage in the artifact's database (data/users/<id>/...).
 * Writes to one document go out one at a time (the store's rule), and a
 * transient failure is retried once after a short random pause.
 */
class AccountBackend implements Backend {
  readonly kind = "account" as const;
  private queues = new Map<string, Promise<unknown>>();
  constructor(private readonly col: Col) {}

  private enqueue<T>(key: string, op: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(key) ?? Promise.resolve();
    const run = prev.catch(() => {}).then(async () => {
      try {
        return await op();
      } catch (e) {
        if (!TRANSIENT.has(codeOf(e))) throw e;
        await sleep(300 + Math.random() * 500);
        return op();
      }
    });
    this.queues.set(key, run);
    // Clean up once settled. Both callbacks swallow, so a failed write is only reported once: to its caller.
    const cleanup = () => {
      if (this.queues.get(key) === run) this.queues.delete(key);
    };
    run.then(cleanup, cleanup);
    return run;
  }

  async getProfile() {
    const snap = await this.col.doc("profile").get();
    return snap.exists ? clone(snap.data() as unknown as Profile) : null;
  }
  putProfile(p: Profile) {
    return this.enqueue("profile", () => this.col.doc("profile").set(clone({ ...p })));
  }
  async listDocs() {
    const snap = await this.col.get();
    return snap.docs.filter((d) => d.id.startsWith("doc-")).map((d) => clone(d.data() as unknown as StoredDoc));
  }
  putDoc(d: StoredDoc) {
    // Stay well under the 256 KiB document limit.
    const text = d.document.text.length > 60_000 ? d.document.text.slice(0, 60_000) : d.document.text;
    const body = clone({ ...d, document: { ...d.document, text } }) as unknown as Record<string, unknown>;
    return this.enqueue(`doc-${d.document.id}`, () => this.col.doc(`doc-${d.document.id}`).set(body));
  }
  deleteDoc(id: string) {
    return this.enqueue(`doc-${id}`, () => this.col.doc(`doc-${id}`).delete());
  }
}

// Codes meaning "this viewer can't save to the account here" (e.g. view-only access).
const NO_ACCESS = new Set(["invalid_argument", "not_granted", "revoked", "capability_disabled", "capability_removed"]);

/**
 * Saves to the account. If the account refuses writes for this viewer, it
 * says so once, moves the data to this browser and remembers that choice
 * across visits; on a later visit it tries to sync the browser copy back.
 * Any other failure is reported to the caller (with its code) instead of
 * being hidden.
 */
class SyncedBackend implements Backend {
  private device: DeviceBackend | null = null;
  constructor(private readonly account: AccountBackend) {}
  get kind() {
    return this.device ? ("device" as const) : ("account" as const);
  }

  async useDevice(reason: string) {
    const device = new DeviceBackend();
    const [profile, docs] = await Promise.all([this.account.getProfile().catch(() => null), this.account.listDocs().catch(() => [])]);
    if (profile && !(await device.getProfile())) await device.putProfile(profile);
    const have = new Set((await device.listDocs()).map((d) => d.document.id));
    for (const d of docs) if (!have.has(d.document.id)) await device.putDoc(d);
    this.device = device;
    writeMode("device");
    notice(reason);
  }

  /** Called at start-up when the last visit fell back to this browser. */
  async trySyncBack(): Promise<boolean> {
    const device = new DeviceBackend();
    const profile = await device.getProfile();
    if (!profile) {
      writeMode(null);
      return true;
    }
    try {
      await this.account.putProfile(profile);
      for (const d of await device.listDocs()) await this.account.putDoc(d);
      device.clear();
      writeMode(null);
      return true;
    } catch {
      this.device = device;
      return false;
    }
  }

  private async write(fn: (b: Backend) => Promise<void>) {
    if (this.device) return fn(this.device);
    try {
      await fn(this.account);
    } catch (e) {
      const code = codeOf(e);
      if (NO_ACCESS.has(code)) {
        await this.useDevice("This page can't save to your claude.ai account, so your changes are being kept in this browser.");
        return fn(this.device!);
      }
      throw new StorageError(code, `Couldn't save your change (${code}). Check your connection and try again.`);
    }
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
        const synced = new SyncedBackend(account);
        if (readMode() === "device" && !(await synced.trySyncBack())) {
          notice("Your changes are being kept in this browser because this page can't save to your account.");
        }
        return synced;
      } catch (e) {
        console.warn("[life-admin] account storage unavailable:", codeOf(e));
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
    return ((await user.me()).name || "").trim();
  } catch {
    return "";
  }
}
