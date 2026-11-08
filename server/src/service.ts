import type { AiEngine } from "./ai/index.js";
import type { Store } from "./store.js";
import type { Deadline, DocumentSource, Household, LifeDocument, User } from "./types.js";
import { newId, newToken, shortCode, slugify } from "./util.js";

export const FREE_DOCS_PER_MONTH = 10;
export const INBOX_DOMAIN = process.env.INBOX_DOMAIN ?? "in.lifeadmin.ie";

export class QuotaError extends Error {}
export class NotFoundError extends Error {}

export const inboxAddress = (u: User) => `${u.inboxSlug}@${INBOX_DOMAIN}`;

export function createUser(store: Store, name: string, email: string, inviteCode?: string): User {
  return store.mutate((db) => {
    let household: Household | undefined;
    if (inviteCode) {
      household = db.households.find((h) => h.inviteCode === inviteCode.trim().toLowerCase());
      if (!household) throw new NotFoundError("That invite code doesn't match a household.");
    } else {
      household = { id: newId(), name: `${name.split(" ")[0]}'s household`, inviteCode: shortCode(8), plan: "free", createdAt: new Date().toISOString() };
      db.households.push(household);
    }
    const user: User = {
      id: newId(),
      name,
      email: email.toLowerCase(),
      householdId: household.id,
      token: newToken(),
      inboxSlug: `${slugify(name.split(" ")[0])}-${shortCode(6)}`,
      calendarToken: newToken(18),
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    return user;
  });
}

export function docsThisMonth(store: Store, householdId: string, now = new Date()): number {
  const month = now.toISOString().slice(0, 7);
  return store.data.documents.filter((d) => d.householdId === householdId && d.createdAt.startsWith(month)).length;
}

export async function ingestDocument(
  store: Store,
  ai: AiEngine,
  user: User,
  source: DocumentSource,
  input: { text?: string; file?: { data: Buffer; mimeType: string; fileName: string } },
  now = new Date(),
): Promise<{ document: LifeDocument; deadlines: Deadline[] }> {
  const household = store.data.households.find((h) => h.id === user.householdId)!;
  if (household.plan === "free" && docsThisMonth(store, household.id, now) >= FREE_DOCS_PER_MONTH) {
    throw new QuotaError(`The free plan covers ${FREE_DOCS_PER_MONTH} documents a month. Upgrade to Premium for unlimited documents.`);
  }

  const { text, analysis } = await ai.analyse({ text: input.text, file: input.file }, now);
  const document: LifeDocument = {
    id: newId(),
    householdId: household.id,
    uploadedBy: user.id,
    source,
    fileName: input.file?.fileName ?? null,
    mimeType: input.file?.mimeType ?? null,
    text,
    analysis,
    status: "needs_review",
    createdAt: now.toISOString(),
  };
  const deadlines: Deadline[] = analysis.deadlines
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date))
    .map((d) => ({
      id: newId(),
      householdId: household.id,
      documentId: document.id,
      title: d.title,
      kind: d.kind,
      date: { value: d.date, confidence: d.confidence, confirmed: false },
      amount: { value: d.amount, confidence: d.amount == null ? "low" : d.confidence, confirmed: false },
      currency: analysis.amountDue?.currency ?? "EUR",
      ownerId: null,
      done: false,
      createdAt: now.toISOString(),
    }));

  store.mutate((db) => {
    db.documents.push(document);
    db.deadlines.push(...deadlines);
  });
  return { document, deadlines };
}

export function publicUser(u: User) {
  return { id: u.id, name: u.name, email: u.email, householdId: u.householdId, inboxAddress: inboxAddress(u), calendarToken: u.calendarToken };
}

export function memberName(store: Store, id: string | null) {
  return id ? store.data.users.find((u) => u.id === id)?.name ?? null : null;
}
