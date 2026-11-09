/** `npm run freetime:snapshot -w server` → server/data/freetime-snapshot.json */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDataset } from "./ingest.js";

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/freetime-snapshot.json");
const data = await buildDataset({ ticketmasterKey: process.env.TICKETMASTER_API_KEY });
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(data));
for (const s of data.sources) console.log(`${s.ok ? "✓" : "✗"} ${s.name}: ${s.count}${s.error ? ` (${s.error})` : ""}`);
console.log(`places ${data.places.length}, upcoming events ${data.events.length} → ${out}`);
