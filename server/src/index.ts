import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createEngine } from "./ai/index.js";
import { createApp } from "./app.js";
import { FreeTimeService } from "./freetime/service.js";
import { dueDigests } from "./reminders.js";
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

/**
 * Reminder loop: one calm digest per person per day, outside quiet hours.
 * In production this sends a push notification or email; here it logs and
 * records what was sent so nothing repeats.
 */
function runReminders() {
  const digests = dueDigests(store.data);
  if (!digests.length) return;
  const sentAt = new Date().toISOString();
  store.mutate((db) => {
    db.digestsSent ??= [];
    for (const d of digests) {
      console.log(`[digest] to ${d.user.email || d.user.name}: ${d.subject}\n${d.body}`);
      db.digestsSent.push({ userId: d.user.id, date: d.date, sentAt });
      for (const r of d.items) {
        if (!db.remindersSent.some((x) => x.deadlineId === r.deadline.id && x.offsetDays === r.offsetDays)) {
          db.remindersSent.push({ deadlineId: r.deadline.id, offsetDays: r.offsetDays, sentAt });
        }
      }
    }
  });
}
runReminders();
setInterval(runReminders, 15 * 60 * 1000).unref();

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`Life Admin API on http://localhost:${port} (AI engine: ${ai.name})`));
