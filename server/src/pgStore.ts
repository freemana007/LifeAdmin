/**
 * Postgres-backed store for serverless hosting (Vercel). Keeps the same in-memory
 * `Database` model as the file store and persists it as one JSONB document with a
 * version number:
 *
 *  - `sync()` before each request reloads the document if another instance changed it;
 *  - `mutate()` changes memory and marks it dirty;
 *  - `flush()` before the response saves it with an optimistic version check. If
 *    another request saved first, it throws `ConflictError` (sent as 409) after
 *    reloading, and the web app offers Retry.
 *
 * One document is fine for a prototype; split into tables before real scale.
 */
import { Store, emptyDatabase } from "./store.js";
import type { Database } from "./types.js";

export interface Queryable {
  query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: R[] }>;
}

export class ConflictError extends Error {
  constructor() {
    super("Someone else changed this at the same moment. Please try again.");
  }
}

const STATE_ID = 1;

export class PgStore extends Store {
  private version = 0;
  private dirty = false;
  private chain: Promise<unknown> = Promise.resolve();

  private constructor(private readonly db_: Queryable) {
    super(null);
  }

  static async open(db: Queryable): Promise<PgStore> {
    await db.query(`CREATE TABLE IF NOT EXISTS lifeadmin_state (
      id integer PRIMARY KEY,
      version integer NOT NULL,
      doc jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS lifeadmin_blobs (
      key text PRIMARY KEY,
      value jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await db.query(
      `INSERT INTO lifeadmin_state (id, version, doc) VALUES ($1, 0, $2::jsonb) ON CONFLICT (id) DO NOTHING`,
      [STATE_ID, JSON.stringify(emptyDatabase())],
    );
    const store = new PgStore(db);
    await store.reload();
    return store;
  }

  /** One at a time per instance: loads and saves never interleave. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => {});
    return run;
  }

  private async reload() {
    const { rows } = await this.db_.query<{ version: number; doc: Database | string }>(`SELECT version, doc FROM lifeadmin_state WHERE id = $1`, [STATE_ID]);
    const row = rows[0];
    const doc = typeof row.doc === "string" ? (JSON.parse(row.doc) as Database) : row.doc;
    this.db = { ...emptyDatabase(), ...doc };
    this.version = row.version;
    this.dirty = false;
  }

  override sync(): Promise<void> {
    return this.serial(async () => {
      if (this.dirty) return; // unsaved changes in flight: keep them
      const { rows } = await this.db_.query<{ version: number }>(`SELECT version FROM lifeadmin_state WHERE id = $1`, [STATE_ID]);
      if (rows[0]?.version !== this.version) await this.reload();
    });
  }

  protected override persist() {
    this.dirty = true;
  }

  override flush(): Promise<void> {
    return this.serial(async () => {
      if (!this.dirty) return;
      const { rows } = await this.db_.query<{ version: number }>(
        `UPDATE lifeadmin_state SET doc = $1::jsonb, version = version + 1, updated_at = now() WHERE id = $2 AND version = $3 RETURNING version`,
        [JSON.stringify(this.db), STATE_ID, this.version],
      );
      if (!rows.length) {
        await this.reload(); // drop our stale copy
        throw new ConflictError();
      }
      this.version = rows[0].version;
      this.dirty = false;
    });
  }

  override async getBlob<T>(key: string): Promise<T | null> {
    const { rows } = await this.db_.query<{ value: T | string }>(`SELECT value FROM lifeadmin_blobs WHERE key = $1`, [key]);
    if (!rows.length) return null;
    const v = rows[0].value;
    return (typeof v === "string" ? JSON.parse(v) : v) as T;
  }

  override async putBlob(key: string, value: unknown): Promise<void> {
    await this.db_.query(
      `INSERT INTO lifeadmin_blobs (key, value, updated_at) VALUES ($1, $2::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, JSON.stringify(value)],
    );
  }
}
