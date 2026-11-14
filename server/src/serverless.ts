/**
 * The app as serverless hosts run it (Vercel, Netlify): data in Postgres, settings
 * from environment variables. See README "Deploy to Vercel" and
 * "Deploy to Netlify + Supabase".
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createEngine } from "./ai/index.js";
import { createApp } from "./app.js";
import { FreeTimeService } from "./freetime/service.js";
import { PgStore } from "./pgStore.js";
import { Store } from "./store.js";

/** Files shipped beside the compiled server (server/data, server/certs). */
const serverFile = (rel: string) => fileURLToPath(new URL(`../${rel}`, import.meta.url));

/** Supabase's own certificate authority (public), used to verify Supabase connections. */
const SUPABASE_CA = "certs/supabase-prod-ca-2021.crt";

/**
 * Connection settings from a URL. TLS settings are decided here rather than by
 * `sslmode` in the URL, which node-postgres would otherwise let override them:
 *  - a CA in DATABASE_CA_CERT, or Supabase's bundled CA for Supabase hosts: verified;
 *  - otherwise `sslmode` other than disable: encrypted, certificate not checked (warned);
 *  - otherwise (e.g. local Postgres): no TLS.
 */
export function pgConfig(url: string, env: NodeJS.ProcessEnv = process.env): pg.PoolConfig {
  const u = new URL(url);
  const sslmode = u.searchParams.get("sslmode");
  u.searchParams.delete("sslmode");
  const supabase = /\.supabase\.(com|co)$/.test(u.hostname);
  const caFile = serverFile(SUPABASE_CA);
  const ca = env.DATABASE_CA_CERT?.trim() || (supabase && existsSync(caFile) ? readFileSync(caFile, "utf8") : undefined);
  let ssl: pg.PoolConfig["ssl"] = false;
  if (ca && sslmode !== "disable") ssl = { ca, rejectUnauthorized: true };
  else if (supabase || (sslmode && sslmode !== "disable")) {
    console.warn("[life-admin] Database connection is encrypted but its certificate isn't checked. Set DATABASE_CA_CERT to verify it.");
    ssl = { rejectUnauthorized: false };
  }
  // Few connections per instance: serverless functions run many instances.
  return { connectionString: u.toString(), ssl, max: 3, idleTimeoutMillis: 10_000 };
}

/**
 * Supabase's shared pooler runs several clusters per region (aws-0-…, aws-1-…), and a
 * project lives on only one. The wrong one answers "Tenant or user not found", which
 * is easy to hit when copying the URL by hand, so that exact error tries the other.
 */
export function otherPoolerUrl(url: string): string | null {
  const u = new URL(url);
  const m = /^aws-(0|1)-(.+\.pooler\.supabase\.com)$/.exec(u.hostname);
  if (!m) return null;
  u.hostname = `aws-${m[1] === "0" ? "1" : "0"}-${m[2]}`;
  return u.toString();
}

async function openPg(url: string, env: NodeJS.ProcessEnv): Promise<PgStore> {
  const open = (u: string) => {
    const pool = new pg.Pool(pgConfig(u, env));
    return PgStore.open(pool, { schema: env.DATABASE_SCHEMA || undefined }).catch(async (err) => {
      await pool.end().catch(() => {});
      throw err;
    });
  };
  try {
    return await open(url);
  } catch (err) {
    const other = otherPoolerUrl(url);
    if (!other || !/tenant or user not found/i.test(String((err as Error)?.message))) throw err;
    console.warn(`[life-admin] ${new URL(url).hostname} doesn't host this project; trying ${new URL(other).hostname}. Update DATABASE_URL to skip this step.`);
    return open(other);
  }
}

export interface ServerlessParts {
  store: Store;
  freeTime: FreeTimeService;
}

/** The store and Free time service, shared by the API function and the scheduled jobs. */
export async function createServerlessParts(env: NodeJS.ProcessEnv = process.env): Promise<ServerlessParts> {
  const url = env.DATABASE_URL ?? env.POSTGRES_URL;
  let store: Store;
  if (url) {
    store = await openPg(url, env);
  } else {
    console.warn("[life-admin] No DATABASE_URL: using a temporary in-memory store. Data will not be kept.");
    store = new Store(null);
  }
  const freeTime = new FreeTimeService({
    snapshotPath: serverFile("data/freetime-snapshot.json"),
    live: true, // forecasts on demand; listings refresh only via the daily scheduled job
    ticketmasterKey: env.TICKETMASTER_API_KEY,
    blobs: store,
  });
  return { store, freeTime };
}

export async function createServerlessApp(env: NodeJS.ProcessEnv = process.env) {
  const { store, freeTime } = await createServerlessParts(env);
  return createApp({
    store,
    ai: createEngine(),
    freeTime,
    inboundSecret: env.INBOUND_SECRET,
    cronSecret: env.CRON_SECRET,
    // Vercel rejects request bodies over 4.5 MB; Netlify allows 6 MB including base64 overhead.
    maxUploadBytes: 4 * 1024 * 1024,
  });
}
