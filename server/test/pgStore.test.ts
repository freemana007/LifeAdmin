import { PGlite } from "@electric-sql/pglite";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { heuristicEngine } from "../src/ai/index.js";
import { createApp } from "../src/app.js";
import { ConflictError, PgStore, type Queryable } from "../src/pgStore.js";
import { electricityBill } from "./fixtures/samples.js";

const pglite = (): Queryable => {
  const db = new PGlite();
  return { query: (text, params) => db.query(text, params as unknown[]) as Promise<{ rows: never[] }> };
};

describe("PgStore (Postgres via PGlite)", () => {
  it("persists changes and a second instance (a cold start) sees them", async () => {
    const db = pglite();
    const a = await PgStore.open(db);
    a.mutate((d) => d.households.push({ id: "h1", name: "Home", inviteCode: "abc", plan: "free", createdAt: "x" }));
    await a.flush();
    const b = await PgStore.open(db);
    expect(b.data.households.map((h) => h.id)).toEqual(["h1"]);
  });

  it("detects a concurrent write, reloads, and lets the next attempt succeed", async () => {
    const db = pglite();
    const a = await PgStore.open(db);
    const b = await PgStore.open(db);
    a.mutate((d) => d.households.push({ id: "from-a", name: "A", inviteCode: "a", plan: "free", createdAt: "x" }));
    await a.flush();
    b.mutate((d) => d.households.push({ id: "from-b", name: "B", inviteCode: "b", plan: "free", createdAt: "x" }));
    await expect(b.flush()).rejects.toBeInstanceOf(ConflictError);
    // b dropped its stale copy and now sees a's write; retrying works.
    expect(b.data.households.map((h) => h.id)).toEqual(["from-a"]);
    b.mutate((d) => d.households.push({ id: "from-b", name: "B", inviteCode: "b", plan: "free", createdAt: "x" }));
    await b.flush();
    await a.sync();
    expect(a.data.households.map((h) => h.id)).toEqual(["from-a", "from-b"]);
  });

  it("stores named values (the latest Free time listings)", async () => {
    const s = await PgStore.open(pglite());
    expect(await s.getBlob("k")).toBeNull();
    await s.putBlob("k", { generatedAt: "2026-11-10", places: [1, 2] });
    await s.putBlob("k", { generatedAt: "2026-11-11", places: [3] });
    expect(await s.getBlob("k")).toEqual({ generatedAt: "2026-11-11", places: [3] });
  });

  it("runs the whole API on Postgres, across instances", async () => {
    const db = pglite();
    const app1 = createApp({ store: await PgStore.open(db), ai: heuristicEngine });
    const signup = await request(app1).post("/api/signup").send({ name: "Aoife" }).expect(201);
    const auth = { Authorization: `Bearer ${signup.body.token}` };
    await request(app1).post("/api/documents").set(auth).field("text", electricityBill).expect(201);
    // A different function instance, same database.
    const app2 = createApp({ store: await PgStore.open(db), ai: heuristicEngine });
    const docs = await request(app2).get("/api/documents").set(auth).expect(200);
    expect(docs.body).toHaveLength(4); // 3 examples + the bill
  });
});

describe("Vercel-specific routes", () => {
  it("cron jobs need the secret", async () => {
    const app = createApp({ store: await PgStore.open(pglite()), ai: heuristicEngine, cronSecret: "s3cret" });
    await request(app).get("/api/cron/reminders").expect(401);
    await request(app).get("/api/cron/reminders").set("Authorization", "Bearer wrong").expect(401);
    const ok = await request(app).get("/api/cron/reminders").set("Authorization", "Bearer s3cret").expect(200);
    expect(ok.body).toMatchObject({ ok: true });
    const none = createApp({ store: await PgStore.open(pglite()), ai: heuristicEngine });
    await request(none).get("/api/cron/reminders").set("Authorization", "Bearer undefined").expect(401);
  });

  it("explains uploads that are over the size limit", async () => {
    const app = createApp({ store: await PgStore.open(pglite()), ai: heuristicEngine, maxUploadBytes: 1024 });
    const s = await request(app).post("/api/signup").send({ name: "Aoife" }).expect(201);
    const res = await request(app)
      .post("/api/documents")
      .set({ Authorization: `Bearer ${s.body.token}` })
      .attach("file", Buffer.alloc(4096, 1), { filename: "big.pdf", contentType: "application/pdf" })
      .expect(413);
    expect(res.body.error).toMatch(/over 0 MB|over/);
  });
});
