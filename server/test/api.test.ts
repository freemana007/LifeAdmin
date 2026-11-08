import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { heuristicEngine } from "../src/ai/index.js";
import { createApp } from "../src/app.js";
import { dueDigests, dueReminders } from "../src/reminders.js";
import { Store } from "../src/store.js";
import { carInsuranceRenewal, electricityBill } from "./fixtures/samples.js";

const NOW = new Date("2026-11-05T09:00:00Z");

let store: Store;
let app: ReturnType<typeof createApp>;

async function signup(name = "Anna Byrne", email = "anna@example.ie", inviteCode?: string) {
  const res = await request(app).post("/api/signup").send({ name, email, inviteCode, examples: false }).expect(201);
  return res.body as { token: string; user: { id: string; inboxAddress: string; calendarToken: string; householdId: string } };
}

beforeEach(() => {
  store = new Store(null);
  app = createApp({ store, ai: heuristicEngine, inboundSecret: "s3cret", now: () => NOW });
});

describe("API", () => {
  it("requires auth", async () => {
    await request(app).get("/api/timeline").expect(401);
  });

  it("captures text, builds the timeline and lets you confirm and assign", async () => {
    const anna = await signup();
    const auth = { Authorization: `Bearer ${anna.token}` };
    const me = await request(app).get("/api/me").set(auth).expect(200);
    const sean = await signup("Seán Byrne", "sean@example.ie", me.body.household.inviteCode);
    expect(sean.user.householdId).toBe(anna.user.householdId);

    const created = await request(app).post("/api/documents").set(auth).field("text", electricityBill).expect(201);
    expect(created.body.document.analysis.docType).toBe("bill");
    const deadlineId = created.body.deadlines[0].id;

    const timeline = await request(app).get("/api/timeline").set(auth).expect(200);
    expect(timeline.body.items).toHaveLength(1);
    expect(timeline.body.stats).toMatchObject({ next30Days: 1, needsReview: 1, dueNext30Days: { EUR: 184.62 } });

    const patched = await request(app).patch(`/api/deadlines/${deadlineId}`).set(auth).send({ ownerId: sean.user.id, confirm: true }).expect(200);
    expect(patched.body).toMatchObject({ ownerName: "Seán Byrne", date: { confirmed: true } });

    // Seán sees the shared timeline.
    const seansView = await request(app).get("/api/timeline").set({ Authorization: `Bearer ${sean.token}` }).expect(200);
    expect(seansView.body.items[0].id).toBe(deadlineId);
  });

  it("keeps households apart", async () => {
    const anna = await signup();
    const other = await signup("Other", "other@example.ie");
    const created = await request(app).post("/api/documents").set({ Authorization: `Bearer ${anna.token}` }).field("text", electricityBill).expect(201);
    await request(app).get(`/api/documents/${created.body.document.id}`).set({ Authorization: `Bearer ${other.token}` }).expect(404);
    await request(app)
      .patch(`/api/deadlines/${created.body.deadlines[0].id}`)
      .set({ Authorization: `Bearer ${other.token}` })
      .send({ done: true })
      .expect(404);
  });

  it("ingests forwarded email for the right person", async () => {
    const anna = await signup();
    await request(app).post("/api/inbound/email").send({ To: anna.user.inboxAddress, TextBody: carInsuranceRenewal }).expect(401);
    const res = await request(app)
      .post("/api/inbound/email")
      .set("X-Inbound-Secret", "s3cret")
      .send({ From: "AXA <renewals@axa.ie>", To: `Anna <${anna.user.inboxAddress}>`, Subject: "Your renewal", TextBody: carInsuranceRenewal })
      .expect(200);
    expect(res.body.accepted).toBe(true);
    const doc = await request(app).get(`/api/documents/${res.body.documentId}`).set({ Authorization: `Bearer ${anna.token}` }).expect(200);
    expect(doc.body.document.source).toBe("email");
    expect(doc.body.deadlines.length).toBeGreaterThanOrEqual(2);
  });

  it("drafts a cancellation email", async () => {
    const anna = await signup();
    const auth = { Authorization: `Bearer ${anna.token}` };
    const created = await request(app).post("/api/documents").set(auth).field("text", carInsuranceRenewal).expect(201);
    const draft = await request(app).post(`/api/documents/${created.body.document.id}/drafts`).set(auth).send({ kind: "cancel" }).expect(200);
    expect(draft.body.subject).toContain("MTR/4471209");
    expect(draft.body.body).toContain("Anna Byrne");
  });

  it("enforces the free plan limit and lifts it on premium", async () => {
    const anna = await signup();
    const auth = { Authorization: `Bearer ${anna.token}` };
    for (let i = 0; i < 10; i++) await request(app).post("/api/documents").set(auth).field("text", electricityBill).expect(201);
    await request(app).post("/api/documents").set(auth).field("text", electricityBill).expect(402);
    await request(app).patch("/api/household").set(auth).send({ plan: "premium" }).expect(200);
    await request(app).post("/api/documents").set(auth).field("text", electricityBill).expect(201);
  });

  it("serves an iCalendar feed and computes reminders", async () => {
    const anna = await signup();
    await request(app).post("/api/documents").set({ Authorization: `Bearer ${anna.token}` }).field("text", electricityBill).expect(201);
    const ics = await request(app).get(`/api/calendar/${anna.user.calendarToken}.ics`).expect(200);
    expect(ics.text).toContain("DTSTART;VALUE=DATE:20261118");
    expect(ics.headers["content-type"]).toMatch(/text\/calendar/);

    // 13 days out: nothing yet. 7 days out: first reminder.
    expect(dueReminders(store.data, NOW)).toHaveLength(0);
    const due = dueReminders(store.data, new Date("2026-11-11T09:00:00Z"));
    expect(due).toHaveLength(1);
    expect(due[0].offsetDays).toBe(7);
    expect(due[0].message).toMatch(/in 7 days/);
  });

  it("rejects a photo without an AI engine with a helpful message", async () => {
    const anna = await signup();
    const res = await request(app)
      .post("/api/documents")
      .set({ Authorization: `Bearer ${anna.token}` })
      .attach("file", Buffer.from([0xff, 0xd8, 0xff]), { filename: "letter.jpg", contentType: "image/jpeg" })
      .expect(422);
    expect(res.body.error).toMatch(/paste the text/);
  });

  it("starts a new household with examples that don't count against the free plan", async () => {
    const res = await request(app).post("/api/signup").send({ name: "Niamh" }).expect(201);
    const auth = { Authorization: `Bearer ${res.body.token}` };
    const docs = await request(app).get("/api/documents").set(auth).expect(200);
    expect(docs.body).toHaveLength(3);
    expect(docs.body.every((d: { example?: boolean }) => d.example)).toBe(true);
    const me = await request(app).get("/api/me").set(auth).expect(200);
    expect(me.body.household.docsThisMonth).toBe(0);
    await request(app).patch("/api/me").set(auth).send({ email: "niamh@example.ie" }).expect(200);
    await request(app).patch("/api/me").set(auth).send({ email: "not-an-email" }).expect(400);
  });

  it("bundles reminders into one daily digest outside quiet hours", async () => {
    const anna = await signup();
    const auth = { Authorization: `Bearer ${anna.token}` };
    await request(app).post("/api/documents").set(auth).field("text", electricityBill).expect(201);
    await request(app).post("/api/documents").set(auth).field("text", carInsuranceRenewal).expect(201);
    // 23:30 Dublin time: quiet hours, nothing goes out.
    expect(dueDigests(store.data, new Date("2026-11-24T23:30:00Z"))).toHaveLength(0);
    // 09:00: one digest covering every due item.
    const morning = new Date("2026-11-24T09:00:00Z");
    const [digest, ...rest] = dueDigests(store.data, morning);
    expect(rest).toHaveLength(0);
    expect(digest.items.length).toBeGreaterThanOrEqual(2);
    expect(digest.body).toContain("That's everything for now.");
    // Once sent, nothing more that day unless something is due today.
    store.data.digestsSent = [{ userId: anna.user.id, date: digest.date, sentAt: morning.toISOString() }];
    expect(dueDigests(store.data, new Date("2026-11-24T15:00:00Z"))).toHaveLength(0);
  });
});
