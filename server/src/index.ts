import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createEngine } from "./ai/index.js";
import { createApp } from "./app.js";
import { FreeTimeService } from "./freetime/service.js";
import { sendDigests } from "./reminders.js";
import { Store } from "./store.js";

const here = dirname(fileURLToPath(import.meta.url));
const store = new Store(resolve(process.env.DATA_FILE ?? join(here, "../../data/db.json")));
const ai = createEngine();
// Free time: start from the committed snapshot, then refresh from the live sources daily.
const freeTime = new FreeTimeService({
  snapshotPath: resolve(here, "../data/freetime-snapshot.json"),
  live: process.env.FREETIME_LIVE !== "0",
  ticketmasterKey: process.env.TICKETMASTER_API_KEY,
});
void freeTime.refresh();
setInterval(() => void freeTime.refresh(), 24 * 60 * 60 * 1000).unref();

const app = createApp({
  freeTime,
  store,
  ai,
  inboundSecret: process.env.INBOUND_SECRET,
  webDist: resolve(here, "../../web/dist"),
});

// Reminder loop: one calm digest per person per day, outside quiet hours.
const runReminders = () => void sendDigests(store);
runReminders();
setInterval(runReminders, 15 * 60 * 1000).unref();

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`Life Admin API on http://localhost:${port} (AI engine: ${ai.name})`));
