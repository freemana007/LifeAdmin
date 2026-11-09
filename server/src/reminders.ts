import type { Store } from "./store.js";
import type { Database, Deadline, SavedPlan, User } from "./types.js";
import { addDays, daysBetween, todayIso } from "./util.js";

/** Days before a deadline when we remind. Renewals get extra lead time to shop around. */
export function reminderOffsets(d: Deadline): number[] {
  if (d.kind === "renewal" || d.kind === "cancellation_window") return [21, 7, 1];
  if (d.kind === "expiry") return [30, 7];
  return [7, 2, 0];
}

export interface DueReminder {
  deadline: Deadline;
  offsetDays: number;
  recipients: User[];
  message: string;
}

/**
 * Reminders that should go out today and haven't been sent yet. A reminder
 * that was missed (e.g. server down) is still sent as long as the deadline
 * hasn't passed, using the closest offset.
 */
export function dueReminders(db: Database, now = new Date()): DueReminder[] {
  const today = todayIso(now);
  const out: DueReminder[] = [];
  for (const d of db.deadlines) {
    if (d.done) continue;
    const daysLeft = daysBetween(today, d.date.value);
    if (daysLeft < 0) continue;
    const offset = reminderOffsets(d)
      .filter((o) => o >= daysLeft)
      .sort((a, b) => a - b)[0];
    if (offset === undefined) continue;
    if (db.remindersSent.some((r) => r.deadlineId === d.id && r.offsetDays === offset)) continue;
    const members = db.users.filter((u) => u.householdId === d.householdId);
    const recipients = d.ownerId ? members.filter((u) => u.id === d.ownerId) : members;
    const when = daysLeft === 0 ? "today" : daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`;
    out.push({ deadline: d, offsetDays: offset, recipients, message: `${d.title} is due ${when} (${d.date.value}).` });
  }
  return out;
}

export interface Digest {
  user: User;
  /** Local calendar date the digest belongs to (YYYY-MM-DD). */
  date: string;
  items: DueReminder[];
  subject: string;
  body: string;
}

export interface DigestOptions {
  timeZone?: string;
  /** Local hour quiet time starts (inclusive). */
  quietStart?: number;
  /** Local hour quiet time ends (exclusive). */
  quietEnd?: number;
}

function localParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

/**
 * Calm notification budget: reminders are bundled into one digest per person
 * per day and never sent in quiet hours. The only extra message allowed is
 * for something due today that wasn't in the morning's digest.
 */
export function dueDigests(db: Database, now = new Date(), opts: DigestOptions = {}): Digest[] {
  const { timeZone = "Europe/Dublin", quietStart = 21, quietEnd = 8 } = opts;
  const { date, hour } = localParts(now, timeZone);
  if (hour >= quietStart || hour < quietEnd) return [];

  const byUser = new Map<string, { user: User; items: DueReminder[] }>();
  for (const r of dueReminders(db, now)) {
    for (const user of r.recipients) {
      const entry = byUser.get(user.id) ?? { user, items: [] };
      entry.items.push(r);
      byUser.set(user.id, entry);
    }
  }

  const digests: Digest[] = [];
  for (const { user, items } of byUser.values()) {
    const alreadySent = (db.digestsSent ?? []).some((d) => d.userId === user.id && d.date === date);
    const chosen = alreadySent ? items.filter((r) => r.offsetDays === 0) : items;
    if (!chosen.length) continue;
    chosen.sort((a, b) => a.deadline.date.value.localeCompare(b.deadline.date.value));
    const subject =
      chosen.length === 1 ? chosen[0].message : `${chosen.length} things coming up – nothing else needs you today`;
    const body = [
      `Hi ${user.name.split(" ")[0]},`,
      "",
      ...chosen.map((r) => `• ${r.message}`),
      "",
      "That's everything for now.",
    ].join("\n");
    digests.push({ user, date, items: chosen, subject, body });
  }
  return digests;
}

/**
 * Sends today's digests (for now: logs them) and records what was sent so nothing
 * repeats. Called by the local server's timer and by the Vercel cron job.
 */
export function sendDigests(store: Store, now = new Date()): Digest[] {
  const digests = dueDigests(store.data, now);
  if (!digests.length) return digests;
  const sentAt = now.toISOString();
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
  return digests;
}

function icsEscape(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => `\\${m}`);
}

/** RFC 5545 calendar of open deadlines. Subscribable from Google, Outlook and Apple Calendar. */
export function deadlinesToIcs(deadlines: Deadline[], now = new Date(), plans: SavedPlan[] = []): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//LifeAdmin//Timeline//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Life Admin"];
  for (const d of deadlines) {
    if (d.done) continue;
    const start = d.date.value.replace(/-/g, "");
    const end = addDays(d.date.value, 1).replace(/-/g, "");
    const amount = d.amount.value != null ? ` (${d.currency ?? "EUR"} ${d.amount.value.toFixed(2)})` : "";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${d.id}@lifeadmin`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${icsEscape(d.title + amount)}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${icsEscape(d.title)}`,
      "TRIGGER:-P2D",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  // Saved free-time plans: one timed event per stop (floating local time).
  for (const p of plans) {
    const day = p.date.replace(/-/g, "");
    p.stops.forEach((s, i) => {
      const t = (hhmm: string) => `${day}T${hhmm.replace(":", "")}00`;
      lines.push(
        "BEGIN:VEVENT",
        `UID:${p.id}-${i}@lifeadmin`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${t(s.start)}`,
        `DTEND:${s.end > s.start ? t(s.end) : t("23:59")}`,
        `SUMMARY:${icsEscape(s.name)}`,
        `LOCATION:${icsEscape(s.venue ?? `${s.lat},${s.lng}`)}`,
        ...(s.url ? [`URL:${s.url}`] : []),
        `DESCRIPTION:${icsEscape(`Part of your free-time plan: ${p.title}`)}`,
        "END:VEVENT",
      );
    });
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
