import type { Database, Deadline, User } from "./types.js";
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

function icsEscape(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => `\\${m}`);
}

/** RFC 5545 calendar of open deadlines. Subscribable from Google, Outlook and Apple Calendar. */
export function deadlinesToIcs(deadlines: Deadline[], now = new Date()): string {
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
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
