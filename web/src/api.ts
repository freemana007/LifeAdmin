export type Confidence = "high" | "medium" | "low";
export type DocType = "bill" | "renewal" | "tax_letter" | "warranty" | "contract" | "official_letter" | "receipt" | "other";
export type DeadlineKind = "payment" | "renewal" | "response" | "cancellation_window" | "expiry" | "appointment" | "other";
export type DraftKind = "cancel" | "reply" | "complaint" | "negotiate";

export interface Field<T> {
  value: T;
  confidence: Confidence;
  confirmed: boolean;
}

export interface Analysis {
  docType: DocType;
  docTypeConfidence: Confidence;
  title: string;
  provider: string | null;
  summary: string;
  actions: string[];
  referenceNumbers: { label: string; value: string }[];
  amountDue: { value: number; currency: string; confidence: Confidence; evidence?: string | null } | null;
  renewalTerms: string | null;
  flags: string[];
  engine: "claude" | "heuristic";
}

export interface Doc {
  id: string;
  source: "photo" | "pdf" | "text" | "email";
  fileName: string | null;
  analysis: Analysis;
  status: "needs_review" | "confirmed";
  createdAt: string;
  uploadedByName: string | null;
  text?: string;
  /** Demo build: a pre-loaded example document. */
  example?: boolean;
}

export interface Deadline {
  id: string;
  documentId: string;
  title: string;
  kind: DeadlineKind;
  date: Field<string>;
  amount: Field<number | null>;
  currency: string | null;
  evidence?: string | null;
  ownerId: string | null;
  ownerName: string | null;
  done: boolean;
  document: { id: string; title: string; docType: DocType; provider: string | null; example?: boolean } | null;
}

export interface Me {
  user: { id: string; name: string; email: string; inboxAddress: string; calendarToken: string };
  household: {
    id: string;
    name: string;
    inviteCode: string;
    plan: "free" | "premium";
    members: { id: string; name: string; email: string }[];
    docsThisMonth: number;
    freeLimit: number;
  };
  ai: "claude" | "heuristic";
  /** Present only in the in-browser demo build. */
  demo?: { storage: "account" | "device"; photos: boolean };
}

export interface Timeline {
  today: string;
  items: Deadline[];
  stats: { overdue: number; next30Days: number; dueNext30Days: Record<string, number>; needsReview: number; done: number };
}

export interface Draft {
  kind: DraftKind;
  subject: string;
  body: string;
  to: string | null;
  engine: "claude" | "heuristic";
}

const TOKEN_KEY = "lifeadmin.token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: session lasts until reload */
  }
}

import { ApiError } from "./apiError";
import type { Interest, PlanRequest, PlanResult, Plan, PlanStop } from "../../server/src/freetime/planner";
import type { Town } from "../../server/src/freetime/towns";
import type { SourceStatus } from "../../server/src/freetime/types";

export type { Interest, Plan, PlanStop, Town, SourceStatus };

export interface FreeTimeMeta {
  towns: Town[];
  interests: Interest[];
  generatedAt: string;
  sources: SourceStatus[];
  /** Demo: listings come from a dated snapshot, with no live forecast. */
  snapshot?: boolean;
}

export type FreeTimeResult = PlanResult & { town: Town; generatedAt: string; sources: SourceStatus[] };

export interface SavedPlan {
  id: string;
  date: string;
  townName: string;
  title: string;
  createdAt: string;
  stops: { name: string; kind: string; start: string; end: string; url: string | null; venue: string | null; lat: number; lng: number }[];
}
import { localApi } from "./demo/localApi";

export { ApiError };

/** The demo build runs entirely in the browser (published as a claude.ai page). */
export const DEMO = import.meta.env.VITE_DEMO === "1";

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, { method, headers, body: payload });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  return data as T;
}

const httpApi = {
  signup: (name: string, inviteCode?: string) => call<{ token: string }>("POST", "/signup", { name, inviteCode: inviteCode || undefined }),
  updateMe: (patch: { email: string }) => call("PATCH", "/me", patch),
  me: () => call<Me>("GET", "/me"),
  updateHousehold: (patch: { name?: string; plan?: "free" | "premium" }) => call("PATCH", "/household", patch),
  timeline: () => call<Timeline>("GET", "/timeline"),
  documents: () => call<Doc[]>("GET", "/documents"),
  document: (id: string) => call<{ document: Doc; deadlines: Deadline[] }>("GET", `/documents/${id}`),
  capture: (form: FormData) => call<{ document: Doc; deadlines: Deadline[] }>("POST", "/documents", form),
  updateDocument: (id: string, patch: { status?: Doc["status"]; title?: string }) => call<Doc>("PATCH", `/documents/${id}`, patch),
  deleteDocument: (id: string) => call<void>("DELETE", `/documents/${id}`),
  draft: (id: string, kind: DraftKind, note?: string) => call<Draft>("POST", `/documents/${id}/drafts`, { kind, note }),
  freeTimeMeta: () => call<FreeTimeMeta>("GET", "/freetime/meta"),
  planFreeTime: (req: PlanRequest & { near: string }) => call<FreeTimeResult>("POST", "/freetime/plan", req),
  savedPlans: () => call<SavedPlan[]>("GET", "/freetime/plans"),
  savePlan: (p: Omit<SavedPlan, "id" | "createdAt">) => call<SavedPlan>("POST", "/freetime/plans", p),
  deletePlan: (id: string) => call<void>("DELETE", `/freetime/plans/${id}`),
  updateDeadline: (
    id: string,
    patch: Partial<{ title: string; date: string; amount: number | null; ownerId: string | null; done: boolean; confirm: boolean }>,
  ) => call<Deadline>("PATCH", `/deadlines/${id}`, patch),
};

export const api: typeof httpApi = DEMO ? (localApi as unknown as typeof httpApi) : httpApi;
