/**
 * Builds the app for Vercel (one serverless function serving /api/*).
 * Configuration comes from environment variables; see README "Deploy to Vercel".
 */
import { join } from "node:path";
import pg from "pg";
import { createEngine } from "./ai/index.js";
import { createApp } from "./app.js";
import { FreeTimeService } from "./freetime/service.js";
import { PgStore } from "./pgStore.js";
import { Store } from "./store.js";

export async function createVercelApp(env: NodeJS.ProcessEnv = process.env) {
  const url = env.DATABASE_URL ?? env.POSTGRES_URL;
  let store: Store;
  if (url) {
    // Few connections per instance: serverless functions run many instances.
    store = await PgStore.open(new pg.Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10_000 }));
  } else {
    console.warn("[life-admin] No DATABASE_URL: using a temporary in-memory store. Data will not be kept.");
    store = new Store(null);
  }
  const freeTime = new FreeTimeService({
    snapshotPath: join(process.cwd(), "server/data/freetime-snapshot.json"),
    live: true, // forecasts on demand; listings refresh only via the daily cron job
    ticketmasterKey: env.TICKETMASTER_API_KEY,
    blobs: store,
  });
  return createApp({
    store,
    ai: createEngine(),
    freeTime,
    inboundSecret: env.INBOUND_SECRET,
    cronSecret: env.CRON_SECRET,
    // Vercel rejects request bodies over 4.5 MB.
    maxUploadBytes: 4 * 1024 * 1024,
  });
}
