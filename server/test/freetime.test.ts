import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { heuristicEngine } from "../src/ai/index.js";
import { createApp } from "../src/app.js";
import { parseCsv } from "../src/freetime/csv.js";
import { distanceKm, plan, travel, type PlanRequest } from "../src/freetime/planner.js";
import { FreeTimeService } from "../src/freetime/service.js";
import { kindFromEvent, mapAttractions, mapEvents } from "../src/freetime/sources/failte.js";
import { parseMetXml } from "../src/freetime/sources/metEireann.js";
import { mapTicketmaster } from "../src/freetime/sources/ticketmaster.js";
import { mapTrails, parseDuration } from "../src/freetime/sources/trails.js";
import { townById } from "../src/freetime/towns.js";
import type { Forecast, FtEvent, Place } from "../src/freetime/types.js";
import { Store } from "../src/store.js";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "fixtures/freetime");
const cork = townById("cork")!;

// ---------- synthetic data around Cork city ----------
const at = (dLat: number, dLng: number) => ({ lat: cork.lat + dLat, lng: cork.lng + dLng });
const place = (id: string, kind: Place["kind"], over: Partial<Place> = {}): Place => ({
  id,
  source: "failte-attractions",
  name: `Place ${id}`,
  kind,
  county: "Cork",
  ...at(0.005, 0.005),
  indoor: ["museum", "pub", "food", "theatre"].includes(kind),
  durationMin: 90,
  price: null,
  free: false,
  kidFriendly: ["museum", "walk", "beach", "family"].includes(kind),
  adultsOnly: kind === "pub" || kind === "club",
  url: `https://example.ie/${id}`,
  summary: "",
  ...over,
});
const event = (id: string, kind: Place["kind"], over: Partial<FtEvent> = {}): FtEvent => ({
  ...place(id, kind),
  source: "failte-events",
  indoor: true,
  startDate: "2026-11-14",
  endDate: "2026-11-14",
  startTime: null,
  venue: "The Venue",
  recurring: false,
  durationMin: 150,
  price: 25,
  ...over,
});

const places: Place[] = [
  place("museum-1", "museum"),
  place("museum-2", "museum", at(0.01, -0.01)),
  place("walk-1", "walk", { source: "sport-ireland-trails", price: 0, free: true, ...at(0.03, 0.02) }),
  place("walk-2", "walk", { price: 0, free: true, ...at(-0.02, 0.01) }),
  place("beach-1", "beach", { price: 0, free: true, ...at(-0.1, 0.1) }),
  place("pub-1", "pub"),
  place("food-1", "food", at(0.002, 0.001)),
  place("far-1", "museum", { lat: 53.35, lng: -6.26 }), // Dublin: outside any Cork radius
];
const events: FtEvent[] = [
  event("gig-1", "gig"),
  event("gig-pricey", "gig", { price: 90, ...at(0.004, 0.002) }),
  event("club-1", "club", { price: 15 }),
  event("gig-other-day", "gig", { startDate: "2026-11-20", endDate: "2026-11-20" }),
];
const base: PlanRequest = { date: "2026-11-14", start: "13:00", end: "17:00", radiusKm: 20, who: "couple", budget: null, interests: [] };
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const ids = (r: ReturnType<typeof plan>) => r.plans.flatMap((p) => p.stops.map((s) => s.id));

describe("csv", () => {
  it("handles quotes, commas, newlines and a BOM", () => {
    const rows = parseCsv('﻿"a","b"\n"x, y","line1\nline2"\n"he said ""hi""",2\n');
    expect(rows).toEqual([
      { a: "x, y", b: "line1\nline2" },
      { a: 'he said "hi"', b: "2" },
    ]);
  });
});

describe("source adapters (recorded real data)", () => {
  it("Fáilte Ireland attractions map to places with coordinates and a kind", () => {
    const ps = mapAttractions(readFileSync(join(FIX, "attractions.csv"), "utf8"));
    expect(ps.length).toBeGreaterThan(30);
    for (const p of ps) {
      expect(Number.isFinite(p.lat) && Number.isFinite(p.lng)).toBe(true);
      expect(["Cork", "Dublin"]).toContain(p.county);
      expect(p.id).toMatch(/^fa-/);
    }
    expect(new Set(ps.map((p) => p.kind)).size).toBeGreaterThan(3);
    expect(ps.some((p) => /language (centre|school)/i.test(p.name))).toBe(false);
  });

  it("Fáilte Ireland events map to dated events, deduplicated", () => {
    const es = mapEvents(readFileSync(join(FIX, "events.csv"), "utf8"));
    expect(es.length).toBeGreaterThan(20);
    for (const e of es) {
      expect(e.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.endDate >= e.startDate).toBe(true);
    }
    expect(new Set(es.map((e) => e.id)).size).toBe(es.length);
  });

  it("classifies events from their text", () => {
    expect(kindFromEvent("Event", "Trad Session at The Corner House", "")).toBe("gig");
    expect(kindFromEvent("Event", "Santa's Grotto", "Bring the kids")).toBe("family");
    expect(kindFromEvent("Event", "Saturday Club Night", "DJ until late")).toBe("club");
    expect(kindFromEvent("Festival", "Cork Jazz Weekend", "")).toBe("gig");
    expect(kindFromEvent("Festival", "Winter Lights", "")).toBe("festival");
  });

  it("Sport Ireland trails map to free walks, with long trails as sections", () => {
    const ts = mapTrails(JSON.parse(readFileSync(join(FIX, "trails.json"), "utf8")).features);
    expect(ts.length).toBeGreaterThan(10);
    expect(ts.every((t) => t.free && t.price === 0 && t.source === "sport-ireland-trails")).toBe(true);
    expect(ts.every((t) => t.durationMin <= 240 && t.durationMin >= 30)).toBe(true);
    expect(parseDuration("2 to 3 days")).toBe(24 * 60);
    expect(parseDuration("1.5 hours")).toBe(90);
    expect(parseDuration("45 mins")).toBe(45);
  });

  it("Ticketmaster events map when present", () => {
    const es = mapTicketmaster({
      _embedded: {
        events: [
          {
            id: "x1",
            name: "Band at the Olympia",
            url: "https://www.ticketmaster.ie/x1",
            dates: { start: { localDate: "2026-11-14", localTime: "19:30:00" } },
            classifications: [{ segment: { name: "Music" }, genre: { name: "Rock" } }],
            priceRanges: [{ min: 39.5 }],
            _embedded: { venues: [{ name: "3Olympia", city: { name: "Dublin" }, location: { latitude: "53.344", longitude: "-6.266" } }] },
          },
        ],
      },
    });
    expect(es[0]).toMatchObject({ kind: "gig", startTime: "19:30", price: 39.5, venue: "3Olympia", source: "ticketmaster" });
  });

  it("parses the Met Éireann forecast XML", () => {
    const xml = `<weatherdata><product>
      <time datatype="forecast" from="2026-11-14T13:00:00Z" to="2026-11-14T13:00:00Z"><location><temperature id="TTT" unit="celsius" value="9.4"/></location></time>
      <time datatype="forecast" from="2026-11-14T12:00:00Z" to="2026-11-14T13:00:00Z"><location><precipitation unit="mm" value="0.8"/></location></time>
      <time datatype="forecast" from="2026-11-14T14:00:00Z" to="2026-11-14T14:00:00Z"><location><temperature id="TTT" unit="celsius" value="10.1"/></location></time>
      <time datatype="forecast" from="2026-11-14T13:00:00Z" to="2026-11-14T14:00:00Z"><location><precipitation unit="mm" value="1.2"/></location></time>
    </product></weatherdata>`;
    const f = parseMetXml(xml);
    expect(f.hours).toEqual([
      { time: "2026-11-14T13:00:00.000Z", tempC: 9.4, rainMm: 0.8 },
      { time: "2026-11-14T14:00:00.000Z", tempC: 10.1, rainMm: 1.2 },
    ]);
  });
});

describe("planner", () => {
  it("only uses places it was given, inside the radius, on the right day", () => {
    const r = plan(base, cork, places, events);
    expect(r.plans.length).toBeGreaterThan(0);
    const known = new Set([...places, ...events].map((p) => p.id));
    for (const id of ids(r)) expect(known.has(id)).toBe(true);
    expect(ids(r)).not.toContain("far-1");
    expect(ids(r)).not.toContain("gig-other-day");
  });

  it("stays inside the time slot and leaves time to travel between stops", () => {
    for (const p of plan(base, cork, places, events).plans) {
      let prevEnd = toMin(base.start);
      for (const s of p.stops) {
        expect(toMin(s.start)).toBeGreaterThanOrEqual(prevEnd + s.travelMin);
        expect(toMin(s.end)).toBeLessThanOrEqual(toMin(base.end));
        prevEnd = toMin(s.end);
      }
    }
  });

  it("never sends kids to a pub or club", () => {
    const r = plan({ ...base, who: "kids", start: "13:00", end: "23:30" }, cork, places, events);
    for (const p of r.plans) for (const s of p.stops) expect(["pub", "club"]).not.toContain(s.kind);
  });

  it("keeps known prices within the per-person budget", () => {
    const r = plan({ ...base, start: "18:00", end: "23:30", budget: 30, interests: ["gigs"] }, cork, places, events);
    expect(ids(r)).not.toContain("gig-pricey");
    for (const p of r.plans) expect(p.knownCostPerPerson).toBeLessThanOrEqual(30);
  });

  it("anchors an evening around a gig at its usual start time", () => {
    const r = plan({ ...base, start: "18:00", end: "23:30", interests: ["gigs"] }, cork, places, events);
    const gig = r.plans[0].stops.find((s) => s.kind === "gig")!;
    expect(gig.start).toBe("20:00");
    expect(gig.notes.join(" ")).toMatch(/Usually starts around 20:00/);
  });

  it("leans indoors when rain is forecast", () => {
    const wet: Forecast = {
      fetchedAt: "",
      hours: [13, 14, 15, 16].map((h) => ({ time: `2026-11-14T${h}:00:00.000Z`, tempC: 9, rainMm: 1.5 })),
    };
    const r = plan({ ...base, interests: ["walks", "heritage"] }, cork, places, [], wet);
    expect(r.weather?.rainy).toBe(true);
    const stops = r.plans[0].stops;
    expect(stops.filter((s) => s.indoor).length).toBeGreaterThan(stops.filter((s) => !s.indoor).length);
  });

  it("offers different alternatives and says when nothing fits", () => {
    const r = plan({ ...base, interests: ["heritage", "walks"] }, cork, places, events);
    const firsts = r.plans.map((p) => p.stops[0].id);
    expect(new Set(firsts).size).toBe(firsts.length);
    const none = plan({ ...base, start: "13:00", end: "13:20" }, cork, places, events);
    expect(none.plans).toHaveLength(0);
    expect(none.notes.join(" ")).toMatch(/Nothing fits/);
  });

  it("estimates travel sensibly", () => {
    expect(travel(0.8).minutes).toBeLessThan(15); // walkable
    expect(travel(20).minutes).toBeGreaterThan(30); // a drive
    expect(Math.round(distanceKm(51.8985, -8.4756, 53.3498, -6.2603))).toBeGreaterThan(200);
  });
});

describe("Free time API", () => {
  async function setup() {
    const store = new Store(null);
    const freeTime = new FreeTimeService();
    freeTime.load({ generatedAt: "2026-11-09T00:00:00.000Z", sources: [], places, events });
    const app = createApp({ store, ai: heuristicEngine, freeTime, now: () => new Date("2026-11-09T10:00:00Z") });
    const res = await request(app).post("/api/signup").send({ name: "Aoife", examples: false }).expect(201);
    return { app, auth: { Authorization: `Bearer ${res.body.token}` }, calendarToken: res.body.user.calendarToken as string };
  }

  it("lists towns, plans a slot, saves it and puts it in the calendar feed", async () => {
    const { app, auth, calendarToken } = await setup();
    const meta = await request(app).get("/api/freetime/meta").expect(200);
    expect(meta.body.towns.some((t: { id: string }) => t.id === "cork")).toBe(true);

    await request(app).post("/api/freetime/plan").send({ ...base, near: "cork" }).expect(401);
    await request(app).post("/api/freetime/plan").set(auth).send({ ...base, near: "atlantis" }).expect(400);
    const r = await request(app).post("/api/freetime/plan").set(auth).send({ ...base, near: "cork", interests: ["heritage"] }).expect(200);
    expect(r.body.plans.length).toBeGreaterThan(0);
    const p = r.body.plans[0];

    const saved = await request(app)
      .post("/api/freetime/plans")
      .set(auth)
      .send({ date: base.date, townName: "Cork", title: p.title, stops: p.stops.map((s: Record<string, unknown>) => ({ name: s.name, kind: s.kind, start: s.start, end: s.end, url: s.url, venue: s.venue, lat: s.lat, lng: s.lng })) })
      .expect(201);
    const list = await request(app).get("/api/freetime/plans").set(auth).expect(200);
    expect(list.body).toHaveLength(1);

    const ics = await request(app).get(`/api/calendar/${calendarToken}.ics`).expect(200);
    expect(ics.text).toContain(`DTSTART:20261114T${p.stops[0].start.replace(":", "")}00`);

    await request(app).delete(`/api/freetime/plans/${saved.body.id}`).set(auth).expect(204);
    expect((await request(app).get("/api/freetime/plans").set(auth)).body).toHaveLength(0);
  });
});
