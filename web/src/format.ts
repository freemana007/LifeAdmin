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

export type Category = "bill" | "renewal" | "official" | "warranty" | "contract" | "receipt" | "other";

const DOC_CAT: Record<DocType, Category> = {
  bill: "bill",
  renewal: "renewal",
  tax_letter: "official",
  official_letter: "official",
  warranty: "warranty",
  contract: "contract",
  receipt: "receipt",
  other: "other",
};
const KIND_CAT: Record<DeadlineKind, Category> = {
  payment: "bill",
  renewal: "renewal",
  cancellation_window: "renewal",
  response: "official",
  expiry: "contract",
  appointment: "official",
  other: "other",
};

/** One colour per kind of letter, used everywhere that letter appears. */
export const categoryOf = (docType?: DocType | null, kind?: DeadlineKind) => (docType ? DOC_CAT[docType] : kind ? KIND_CAT[kind] : "other");

/** "Pay by", "Renews", … : the verb that goes in front of the date. */
export const DATE_VERB: Record<DeadlineKind, string> = {
  payment: "Pay by",
  renewal: "Renews",
  cancellation_window: "Cancel by",
  response: "Reply by",
  expiry: "Ends",
  appointment: "On",
  other: "Due",
};

export const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export const monthLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IE", { month: "long", year: "numeric", timeZone: "UTC" });

/** "Electric Ireland" → "EI", "AXA" → "AXA", "Revenue" → "Re". */
export function initials(name: string | null | undefined): string {
  const clean = (name ?? "").replace(/[^\p{L}\p{N}\s&+]/gu, " ").trim();
  if (!clean) return "?";
  const words = clean.split(/\s+/).filter((w) => !/^(the|of|and|&|ltd|limited|plc|dac|insurance)$/i.test(w));
  const ws = words.length ? words : clean.split(/\s+/);
  if (ws.length === 1) return /^[A-Z0-9]{2,4}$/.test(ws[0]) ? ws[0] : ws[0].slice(0, 2).replace(/^./, (c) => c.toUpperCase());
  return (ws[0][0] + ws[1][0]).toUpperCase();
}
