/**
 * Offline, rule-based document understanding. Used when no Claude API key is
 * configured (local dev, tests, demos) and as a safety net if the API call
 * fails. Tuned for Irish and UK household post.
 */
import type { Confidence, DeadlineKind, DocType, DocumentAnalysis } from "../types.js";

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const KNOWN_PROVIDERS = [
  "Electric Ireland", "Bord Gáis Energy", "Bord Gais Energy", "SSE Airtricity", "Energia", "Flogas", "Pinergy",
  "Uisce Éireann", "Irish Water", "Eir", "Vodafone", "Three", "Virgin Media", "Sky", "Pure Telecom",
  "Aviva", "AXA", "FBD", "Zurich", "Allianz", "Liberty Insurance", "RSA", "Irish Life", "Laya Healthcare",
  "Vhi", "Irish Life Health", "Level Life", "AIB", "Bank of Ireland", "PTSB", "Revenue", "Revenue Commissioners",
  "Department of Social Protection", "An Post", "TV Licence", "NCT", "National Car Testing Service", "Motor Tax",
  "HMRC", "DVLA", "British Gas", "Octopus Energy", "EDF", "E.ON", "OVO", "BT", "Thames Water", "Council Tax",
  "Netflix", "Spotify", "Disney+", "Amazon Prime", "Apple", "Google", "PayPal", "Currys", "Harvey Norman", "DID Electrical",
];

const TYPE_KEYWORDS: Record<Exclude<DocType, "other">, RegExp[]> = {
  bill: [/\bbill\b/i, /\binvoice\b/i, /amount (due|owed|payable)/i, /\bbalance due\b/i, /\bdirect debit\b/i, /\bpay(ment)? by\b/i, /\bstatement\b/i],
  renewal: [/\brenew(al|s|ed)?\b/i, /\bpolicy (schedule|renewal)\b/i, /\bauto(matic(ally)?)?[- ]renew/i, /\bpremium\b/i, /\bcontract end\b/i, /\bno claims\b/i],
  tax_letter: [/\brevenue\b/i, /\bhmrc\b/i, /\btax (return|credit|bill|year)\b/i, /\bself[- ]assessment\b/i, /\blocal property tax\b/i, /\bLPT\b/, /\bPAYE\b/, /\bpreliminary tax\b/i, /\bmyaccount\b/i],
  warranty: [/\bwarrant(y|ies)\b/i, /\bguarantee\b/i, /\bextended cover\b/i, /\bproduct registration\b/i],
  contract: [/\bagreement\b/i, /\bterms and conditions\b/i, /\bminimum term\b/i, /\bcontract\b/i, /\btenancy\b/i, /\blease\b/i],
  official_letter: [/\bdepartment of\b/i, /\bcouncil\b/i, /\bpassport\b/i, /\bnct\b/i, /\bmotor tax\b/i, /\btv licen[cs]e\b/i, /\bdvla\b/i, /\bcourt\b/i, /\bappointment\b/i],
  receipt: [/\breceipt\b/i, /\bthank you for your (purchase|order)\b/i, /\border (number|confirmation)\b/i, /\bpaid\b/i],
};

const DATE_CUES: { re: RegExp; kind: DeadlineKind; title: string }[] = [
  { re: /(cancel(lation)?|cooling[- ]off|opt[- ]out|(do not|don't) (wish|want) to renew)[^.\n]{0,60}(by|before|until|on)\b/i, kind: "cancellation_window", title: "Last day to cancel" },
  { re: /(renew(al)? date|renews on|will renew|due for renewal|policy (start|renewal) date|renewal)/i, kind: "renewal", title: "Renewal" },
  { re: /(expir(y|es|ation)|valid until|end date|ends on|contract end)/i, kind: "expiry", title: "Expires" },
  { re: /(respond|reply|return (this|the) form|file|submit|deadline|no later than)[^.\n]{0,30}(by|before|on)?/i, kind: "response", title: "Respond by" },
  { re: /(due date|payment due|pay(ment)? by|due on|will be (debited|collected|taken)|direct debit date|amount due by|please pay)/i, kind: "payment", title: "Payment due" },
  { re: /(appointment|test date|your test is|scheduled for)/i, kind: "appointment", title: "Appointment" },
];

const REF_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "Account number", re: /account (?:no\.?|number|num)[:\s#]*([A-Z0-9][A-Z0-9 -]{3,20}[A-Z0-9])/i },
  { label: "Policy number", re: /policy (?:no\.?|number)[:\s#]*([A-Z0-9][A-Z0-9/ -]{3,20}[A-Z0-9])/i },
  { label: "Invoice number", re: /invoice (?:no\.?|number)[:\s#]*([A-Z0-9][A-Z0-9/ -]{2,20}[A-Z0-9])/i },
  { label: "Customer number", re: /customer (?:no\.?|number|id|reference)[:\s#]*([A-Z0-9][A-Z0-9 -]{3,20}[A-Z0-9])/i },
  { label: "Reference", re: /\b(?:your )?ref(?:erence)?(?: no\.?| number)?[:\s#]+([A-Z0-9][A-Z0-9/ -]{3,20}[A-Z0-9])/i },
  { label: "MPRN", re: /\bMPRN[:\s#]*(\d[\d ]{8,13}\d)/i },
  { label: "GPRN", re: /\bGPRN[:\s#]*(\d[\d ]{5,10}\d)/i },
  { label: "Vehicle registration", re: /\b(?:vehicle )?reg(?:istration)?(?: no\.?| number)?[:\s]+(\d{2,3}-[A-Z]{1,2}-\d{1,6})/i },
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toIso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export interface FoundDate {
  iso: string;
  index: number;
  raw: string;
}

/** Finds dates in day-first (IE/UK), ISO and written-month formats. */
export function findDates(text: string): FoundDate[] {
  const out: FoundDate[] = [];
  const push = (iso: string | null, m: RegExpExecArray) => {
    if (iso) out.push({ iso, index: m.index, raw: m[0] });
  };
  const monthNames = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  for (let m; (m = iso.exec(text)); ) push(toIso(+m[1], +m[2], +m[3]), m);

  const numeric = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/g;
  for (let m; (m = numeric.exec(text)); ) push(toIso(+m[3], +m[2], +m[1]), m);

  const dayMonth = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+(${monthNames})\\.?,?\\s+(\\d{4})\\b`, "gi");
  for (let m; (m = dayMonth.exec(text)); ) push(toIso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]), m);

  const monthDay = new RegExp(`\\b(${monthNames})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "gi");
  for (let m; (m = monthDay.exec(text)); ) push(toIso(+m[3], MONTHS[m[1].toLowerCase()], +m[2]), m);

  return out.sort((a, b) => a.index - b.index);
}

export interface FoundAmount {
  value: number;
  currency: string;
  index: number;
}

export function findAmounts(text: string): FoundAmount[] {
  const out: FoundAmount[] = [];
  const re = /(€|£|\bEUR\s?|\bGBP\s?)\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)|(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+\.\d{2})\s?(€|EUR\b|euro)/gi;
  for (let m; (m = re.exec(text)); ) {
    const sym = (m[1] ?? m[4] ?? "").trim().toUpperCase();
    const num = Number((m[2] ?? m[3]).replace(/,/g, ""));
    if (!Number.isFinite(num)) continue;
    const currency = sym === "£" || sym === "GBP" ? "GBP" : "EUR";
    out.push({ value: num, currency, index: m.index });
  }
  return out;
}

function classify(text: string): { docType: DocType; confidence: Confidence } {
  let best: DocType = "other";
  let bestScore = 0;
  let second = 0;
  for (const [type, patterns] of Object.entries(TYPE_KEYWORDS) as [DocType, RegExp[]][]) {
    const score = patterns.reduce((s, re) => s + (re.test(text) ? 1 : 0), 0);
    if (score > bestScore) {
      second = bestScore;
      bestScore = score;
      best = type;
    } else if (score > second) {
      second = score;
    }
  }
  const confidence: Confidence = bestScore >= 3 && bestScore - second >= 2 ? "high" : bestScore >= 2 ? "medium" : "low";
  return { docType: best, confidence };
}

function findProvider(text: string): string | null {
  const head = text.slice(0, 1500);
  for (const p of KNOWN_PROVIDERS) {
    const re = new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(head) || re.test(text)) return p.replace("Bord Gais", "Bord Gáis");
  }
  // Fall back to a "From:" header (forwarded emails) or the first short line.
  const from = text.match(/^from:\s*"?([^"<\n]+?)"?\s*(<|$)/im);
  if (from) return from[1].trim();
  const first = text.split("\n").map((l) => l.trim()).find((l) => l.length > 2 && l.length < 40 && !/\d{3,}/.test(l));
  return first ?? null;
}

function lineAround(text: string, index: number): string {
  const start = text.lastIndexOf("\n", index) + 1;
  const end = text.indexOf("\n", index);
  return text.slice(start, end === -1 ? undefined : end);
}

const TYPE_LABEL: Record<DocType, string> = {
  bill: "bill",
  renewal: "renewal notice",
  tax_letter: "tax letter",
  warranty: "warranty",
  contract: "contract",
  official_letter: "official letter",
  receipt: "receipt",
  other: "document",
};

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(value);
}

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function analyseHeuristically(text: string, now = new Date()): DocumentAnalysis {
  const clean = text.replace(/\r/g, "");
  const { docType, confidence } = classify(clean);
  const provider = findProvider(clean);
  const dates = findDates(clean);
  const amounts = findAmounts(clean);
  const today = now.toISOString().slice(0, 10);

  // Amount due: prefer an amount on a line that talks about paying/total.
  const dueAmount =
    amounts.find((a) => /(total|amount due|balance|to pay|payable|premium|you owe|due)/i.test(lineAround(clean, a.index))) ??
    (amounts.length ? amounts.reduce((max, a) => (a.value > max.value ? a : max)) : undefined);

  const deadlines: DocumentAnalysis["deadlines"] = [];
  const seen = new Set<string>();
  for (const d of dates) {
    // Look for a cue in the date's own sentence/line so neighbouring dates don't steal it.
    const lineStart = clean.lastIndexOf("\n", d.index) + 1;
    const sentenceStart = clean.lastIndexOf(". ", d.index);
    const start = Math.max(lineStart, sentenceStart + 1, d.index - 120);
    const context = clean.slice(start, d.index + d.raw.length + 10);
    const cue = DATE_CUES.find((c) => c.re.test(context));
    if (!cue) continue;
    const key = `${cue.kind}:${d.iso}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const amountNearby = cue.kind === "payment" || cue.kind === "renewal" ? dueAmount?.value ?? null : null;
    deadlines.push({
      title: provider ? `${cue.title} – ${provider}` : cue.title,
      kind: cue.kind,
      date: d.iso,
      amount: amountNearby,
      confidence: d.iso >= today ? "medium" : "low",
    });
  }
  // A bill with a date but no explicit cue: take the latest future date as the due date.
  if (!deadlines.length && (docType === "bill" || docType === "renewal")) {
    const future = dates.filter((d) => d.iso >= today).sort((a, b) => (a.iso < b.iso ? 1 : -1))[0];
    if (future) {
      deadlines.push({
        title: provider ? `${docType === "bill" ? "Payment due" : "Renewal"} – ${provider}` : docType === "bill" ? "Payment due" : "Renewal",
        kind: docType === "bill" ? "payment" : "renewal",
        date: future.iso,
        amount: dueAmount?.value ?? null,
        confidence: "low",
      });
    }
  }
  deadlines.sort((a, b) => (a.date < b.date ? -1 : 1));

  const referenceNumbers: DocumentAnalysis["referenceNumbers"] = [];
  for (const { label, re } of REF_PATTERNS) {
    const m = clean.match(re);
    if (m && !referenceNumbers.some((r) => r.value === m[1].trim())) referenceNumbers.push({ label, value: m[1].trim() });
  }

  const renewalLine = clean
    .split("\n")
    .find((l) => /(auto(matic(ally)?)?[- ]?renew|renews? automatically|minimum term|notice period|cooling[- ]off)/i.test(l));

  const flags: string[] = [];
  const increase = clean.match(/(increase|rise|up)\s+(by|of)?\s*(€|£)?\s?(\d+(?:\.\d{2})?)\s?(%|percent)?/i);
  if (increase && (docType === "renewal" || docType === "bill")) {
    flags.push(`Price change mentioned (${increase[0].trim()}). Worth comparing alternatives before it renews.`);
  }
  if (docType === "renewal" && /(auto(matic(ally)?)?[- ]?renew|renews? automatically)/i.test(clean)) {
    flags.push("This renews automatically unless you act. Loyalty pricing is often worse than new-customer quotes.");
  }

  const next = deadlines.find((d) => d.date >= today) ?? deadlines[0];
  const actions: string[] = [];
  if (next) {
    const verb: Record<DeadlineKind, string> = {
      payment: "Pay",
      renewal: "Decide whether to renew, switch or cancel before",
      response: "Reply or submit what's asked before",
      cancellation_window: "Cancel, if you want to, before",
      expiry: "Replace or renew before it expires on",
      appointment: "Attend the appointment on",
      other: "Deal with this before",
    };
    const amountText = dueAmount && next.kind === "payment" ? `${formatMoney(dueAmount.value, dueAmount.currency)} ` : "";
    actions.push(next.kind === "payment" ? `Pay ${amountText}by ${formatDate(next.date)}.` : `${verb[next.kind]} ${formatDate(next.date)}.`);
  }
  if (docType === "renewal") actions.push("Get one or two comparison quotes before the renewal date.");
  if (docType === "warranty" || docType === "receipt") actions.push("Keep this safe – you may need it for a warranty or return claim.");
  if (docType === "tax_letter") actions.push("Check the figures against your own records and log in to your tax account if anything is due.");
  if (!actions.length) actions.push("No action spotted. File it for reference.");

  const parts = [
    `This looks like a ${TYPE_LABEL[docType]}${provider ? ` from ${provider}` : ""}.`,
    dueAmount ? `The main amount mentioned is ${formatMoney(dueAmount.value, dueAmount.currency)}.` : "",
    next ? `The key date is ${formatDate(next.date)}.` : "We couldn't find a clear deadline – please check the document.",
  ];

  return {
    docType,
    docTypeConfidence: confidence,
    title: `${provider ?? "Unknown sender"} – ${TYPE_LABEL[docType]}`,
    provider,
    summary: parts.filter(Boolean).join(" "),
    actions,
    referenceNumbers,
    amountDue: dueAmount ? { value: dueAmount.value, currency: dueAmount.currency, confidence: amounts.length === 1 ? "medium" : "low" } : null,
    renewalTerms: renewalLine?.trim() ?? null,
    deadlines,
    flags,
    engine: "heuristic",
  };
}
