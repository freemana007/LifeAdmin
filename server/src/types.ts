export const DOC_TYPES = [
  "bill",
  "renewal",
  "tax_letter",
  "warranty",
  "contract",
  "official_letter",
  "receipt",
  "other",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DEADLINE_KINDS = ["payment", "renewal", "response", "cancellation_window", "expiry", "appointment", "other"] as const;
export type DeadlineKind = (typeof DEADLINE_KINDS)[number];

export type Plan = "free" | "premium";

export interface User {
  id: string;
  name: string;
  email: string;
  householdId: string;
  /** Secret bearer token for the API. Prototype auth only. */
  token: string;
  /** Local part of the personal forwarding address, e.g. "anna-7k3p2q". */
  inboxSlug: string;
  /** Token used for the read-only calendar feed. */
  calendarToken: string;
  createdAt: string;
}

export interface Household {
  id: string;
  name: string;
  inviteCode: string;
  plan: Plan;
  createdAt: string;
}

export type Confidence = "high" | "medium" | "low";

export interface ExtractedField<T> {
  value: T;
  confidence: Confidence;
  /** True once a person has checked or corrected the value. */
  confirmed: boolean;
}

export interface Deadline {
  id: string;
  householdId: string;
  documentId: string;
  title: string;
  kind: DeadlineKind;
  /** ISO date (YYYY-MM-DD). */
  date: ExtractedField<string>;
  amount: ExtractedField<number | null>;
  currency: string | null;
  /** The phrase in the document this deadline was read from, so people can check it. */
  evidence: string | null;
  ownerId: string | null;
  done: boolean;
  createdAt: string;
}

export interface DocumentAnalysis {
  docType: DocType;
  docTypeConfidence: Confidence;
  title: string;
  provider: string | null;
  summary: string;
  /** Plain-English list of what the household needs to do. */
  actions: string[];
  referenceNumbers: { label: string; value: string }[];
  amountDue: { value: number; currency: string; confidence: Confidence; evidence?: string | null } | null;
  renewalTerms: string | null;
  deadlines: {
    title: string;
    kind: DeadlineKind;
    date: string;
    amount: number | null;
    confidence: Confidence;
    /** Short quote from the document that supports the date. */
    evidence?: string | null;
  }[];
  /** Hint for the "Act" step, e.g. a price rise worth challenging. */
  flags: string[];
  engine: "claude" | "heuristic";
}

export type DocumentSource = "photo" | "pdf" | "text" | "email";

export interface LifeDocument {
  id: string;
  householdId: string;
  uploadedBy: string;
  source: DocumentSource;
  fileName: string | null;
  mimeType: string | null;
  /** Extracted text, kept so the document can be re-analysed and drafted against. */
  text: string;
  analysis: DocumentAnalysis;
  status: "needs_review" | "confirmed";
  createdAt: string;
  /** Pre-loaded example shown to new households; not counted against the free plan. */
  example?: boolean;
}

export const DRAFT_KINDS = ["cancel", "reply", "complaint", "negotiate"] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

export interface Draft {
  kind: DraftKind;
  subject: string;
  body: string;
  to: string | null;
  engine: "claude" | "heuristic";
}

export interface FreeTimeTaste {
  userId: string;
  /** Likes and passes per kind of outing (walk, gig, pub, …). */
  kinds: Record<string, { like: number; pass: number }>;
  /** Cards swiped right, newest last (kept to the latest 100). */
  liked: (Record<string, unknown> & { id: string; kind: string; date: string; likedAt: string })[];
  /** Ids swiped left (kept to the latest 500). */
  passed: { id: string; kind: string }[];
}

export interface SavedPlan {
  id: string;
  householdId: string;
  createdBy: string;
  createdAt: string;
  date: string;
  townName: string;
  title: string;
  stops: { name: string; kind: string; start: string; end: string; url: string | null; venue: string | null; lat: number; lng: number }[];
}

export interface Database {
  users: User[];
  households: Household[];
  documents: LifeDocument[];
  deadlines: Deadline[];
  remindersSent: { deadlineId: string; offsetDays: number; sentAt: string }[];
  /** Each person's swipes in Free time: taste by kind, and what they liked. */
  freeTimeTaste?: FreeTimeTaste[];
  /** Plans from the Free time tab that a household kept. */
  freeTimePlans?: SavedPlan[];
  /** One digest per person per day (calm notification budget). */
  digestsSent?: { userId: string; date: string; sentAt: string }[];
}
