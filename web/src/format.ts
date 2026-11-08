import type { DeadlineKind, DocType } from "./api";

export const money = (value: number, currency = "EUR") =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(value);

export const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IE", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function daysUntil(iso: string, today: string) {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export function relative(iso: string, today: string) {
  const d = daysUntil(iso, today);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d === -1) return "Yesterday";
  if (d < 0) return `${-d} days overdue`;
  if (d < 14) return `In ${d} days`;
  if (d < 60) return `In ${Math.round(d / 7)} weeks`;
  return `In ${Math.round(d / 30)} months`;
}

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  bill: "Bill",
  renewal: "Renewal",
  tax_letter: "Tax letter",
  warranty: "Warranty",
  contract: "Contract",
  official_letter: "Official letter",
  receipt: "Receipt",
  other: "Other",
};

export const KIND_LABEL: Record<DeadlineKind, string> = {
  payment: "Payment",
  renewal: "Renewal",
  response: "Reply needed",
  cancellation_window: "Cancel by",
  expiry: "Expiry",
  appointment: "Appointment",
  other: "Deadline",
};

export const totals = (byCurrency: Record<string, number>) =>
  Object.entries(byCurrency)
    .map(([c, v]) => money(v, c))
    .join(" + ") || money(0);
