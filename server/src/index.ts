import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createEngine } from "./ai/index.js";
import { createApp } from "./app.js";
import { dueReminders } from "./reminders.js";
import { Store } from "./store.js";

const here = dirname(fileURLToPath(import.meta.url));
const store = new Store(resolve(process.env.DATA_FILE ?? join(here, "../../data/db.json")));
const ai = createEngine();
const app = createApp({
  store,
  ai,
  inboundSecret: process.env.INBOUND_SECRET,
  webDist: resolve(here, "../../web/dist"),
});

/**
 * Reminder loop. In production this sends push notifications/emails; here it
 * logs and records them so each reminder fires once.
 */
function runReminders() {
  const due = dueReminders(store.data);
  if (!due.length) return;
  store.mutate((db) => {
    for (const r of due) {
      console.log(`[reminder] to ${r.recipients.map((u) => u.email).join(", ")}: ${r.message}`);
      db.remindersSent.push({ deadlineId: r.deadline.id, offsetDays: r.offsetDays, sentAt: new Date().toISOString() });
    }
  });
}
runReminders();
setInterval(runReminders, 60 * 60 * 1000).unref();

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`Life Admin API on http://localhost:${port} (AI engine: ${ai.name})`));
