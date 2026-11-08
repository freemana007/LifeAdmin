import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { Database } from "./types.js";

const empty = (): Database => ({ users: [], households: [], documents: [], deadlines: [], remindersSent: [] });

/**
 * A tiny JSON-file store. Good enough for the prototype and for tests (pass
 * `null` for an in-memory store). Swap for Postgres/Cosmos before launch.
 */
export class Store {
  private db: Database;

  constructor(private readonly path: string | null) {
    this.db = empty();
    if (path && existsSync(path)) {
      this.db = { ...empty(), ...JSON.parse(readFileSync(path, "utf8")) };
    }
  }

  get data(): Database {
    return this.db;
  }

  /** Run a mutation and persist atomically. */
  mutate<T>(fn: (db: Database) => T): T {
    const result = fn(this.db);
    this.flush();
    return result;
  }

  private flush() {
    if (!this.path) return;
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.db, null, 2));
    renameSync(tmp, this.path);
  }
}
