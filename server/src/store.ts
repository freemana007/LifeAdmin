import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { Database } from "./types.js";

export const emptyDatabase = (): Database => ({ users: [], households: [], documents: [], deadlines: [], remindersSent: [] });

/**
 * A tiny JSON-file store for local development and tests (pass `null` for an
 * in-memory store). On Vercel, `PgStore` (pgStore.ts) keeps the same model in Postgres.
 */
export class Store {
  protected db: Database;

  constructor(private readonly path: string | null) {
    this.db = emptyDatabase();
    if (path && existsSync(path)) {
      this.db = { ...emptyDatabase(), ...JSON.parse(readFileSync(path, "utf8")) };
    }
  }

  get data(): Database {
    return this.db;
  }

  /** Run a mutation and persist atomically. */
  mutate<T>(fn: (db: Database) => T): T {
    const result = fn(this.db);
    this.persist();
    return result;
  }

  /** Before a request: pick up changes made elsewhere (no-op for the file store). */
  async sync(): Promise<void> {}

  /** After a request: make its changes durable (no-op: the file store writes in `mutate`). */
  async flush(): Promise<void> {}

  /** Small named values kept beside the data, e.g. the latest Free time listings. */
  private blobs = new Map<string, unknown>();
  async getBlob<T>(key: string): Promise<T | null> {
    return (this.blobs.get(key) as T) ?? null;
  }
  async putBlob(key: string, value: unknown): Promise<void> {
    this.blobs.set(key, value);
  }

  protected persist() {
    if (!this.path) return;
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.db, null, 2));
    renameSync(tmp, this.path);
  }
}
