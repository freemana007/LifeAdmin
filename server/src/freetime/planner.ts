/**
 * Turns a free slot ("Saturday 14:00–18:00 near Cork, with kids, €20 each, walks + heritage")
 * into up to three short itineraries built only from the places and events it is given.
 *
 * Pure and deterministic: the same inputs always give the same plans. Used by the API
 * and, unchanged, by the phone demo in the browser.
 */
import type { Town } from "./towns.js";
import type { Forecast, FtEvent, Kind, Place } from "./types.js";

export const INTERESTS = ["walks", "gigs", "nightlife", "heritage", "family", "rainy", "food", "sport", "arts"] as const;
export type Interest = (typeof INTERESTS)[number];
export type Who = "solo" | "couple" | "kids" | "friends";

export const INTEREST_KINDS: Record<Interest, Kind[]> = {
  walks: ["walk", "nature", "beach"],
  gigs: ["gig", "music"],
  nightlife: ["club", "pub", "comedy"],
  heritage: ["heritage", "museum", "tour"],
  family: ["family"],
  rainy: [],
  food: ["food", "market"],
  sport: ["sport", "water"],
  arts: ["theatre", "museum", "festival", "talk"],
};

export interface PlanRequest {
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string; // HH:MM
  radiusKm: number;
  who: Who;
  /** Per person, in euro. null = no limit. */
  budget: number | null;
  interests: Interest[];
  /** What this person has liked and passed on before, by kind (from swiping). */
  taste?: Taste;
  /** Items they swiped right on: built into the plan wherever they fit. */
  prefer?: string[];
  /** Items they swiped left on: never suggested. */
  avoid?: string[];
}

export type Taste = Partial<Record<Kind, { like: number; pass: number }>>;

/**
 * How much someone seems to like a kind of outing: -2.5 (always passes) to +2.5
 * (always likes), shrinking towards 0 when there are only a few swipes.
 */
export function tasteBoost(taste: Taste | undefined, kind: Kind): number {
  const t = taste?.[kind];
  if (!t) return 0;
  const n = t.like + t.pass;
  const rate = (t.like + 1) / (n + 2); // smoothed
  const confidence = Math.min(1, n / 4);
  return (rate - 0.5) * 5 * confidence;
}

export interface PlanStop {
  id: string;
  name: string;
  kind: Kind;
  source: Place["source"];
  url: string | null;
  county: string;
  lat: number;
  lng: number;
  start: string;
  end: string;
  travelMin: number;
  travelKm: number;
  price: number | null;
  free: boolean;
  indoor: boolean;
  summary: string;
  venue: string | null;
  notes: string[];
}

export interface Plan {
  id: string;
  title: string;
  stops: PlanStop[];
  /** Sum of known prices per person; stops with no listed price are excluded. */
  knownCostPerPerson: number;
  priceUnknown: boolean;
  /** Some stops use typical opening hours because the source lists none. */
  hoursTypical: boolean;
}

export interface WeatherSummary {
  rainy: boolean;
  summary: string;
  tempMin: number | null;
  tempMax: number | null;
  rainMm: number;
}

export interface PlanResult {
  plans: Plan[];
  weather: WeatherSummary | null;
  considered: number;
  notes: string[];
}

// ---------- time helpers ----------

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const fmt = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Approximate sunset in Ireland by month (local time, minutes). Outdoor stops end by then. */
const SUNSET = [16 * 60 + 45, 17 * 60 + 35, 18 * 60 + 25, 20 * 60 + 20, 21 * 60 + 10, 21 * 60 + 55, 21 * 60 + 50, 21 * 60, 19 * 60 + 50, 18 * 60 + 40, 16 * 60 + 50, 16 * 60 + 20];

/** Typical opening hours by kind when the source gives none. */
function usualHours(kind: Kind, indoor: boolean, month: number): [number, number] {
  const dusk = SUNSET[month];
  switch (kind) {
    case "walk":
    case "nature":
    case "beach":
    case "water":
      return [8 * 60, dusk];
    case "sport":
      return indoor ? [9 * 60, 21 * 60] : [9 * 60, dusk];
    case "food":
      return [12 * 60, 21 * 60 + 30];
    case "pub":
      return [12 * 60, 23 * 60 + 30];
    case "music":
      return [19 * 60, 23 * 60 + 30];
    case "club":
      return [22 * 60, 26 * 60];
    case "wellness":
      return [9 * 60, 20 * 60];
    case "family":
      return [10 * 60, 18 * 60];
    default:
      return [10 * 60, 17 * 60];
  }
}

/** When an event with no listed time usually starts. */
function usualEventStart(kind: Kind): number | null {
  if (kind === "gig" || kind === "theatre" || kind === "comedy") return 20 * 60;
  if (kind === "club") return 22 * 60 + 30;
  return null; // daytime events: any time in their usual hours
}

// ---------- geography ----------

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Straight-line distance → a road-ish journey: on foot under 1.2 km, otherwise driving at ~50 km/h plus parking. */
export function travel(km: number): { minutes: number; roadKm: number } {
  if (km < 0.05) return { minutes: 0, roadKm: 0 };
  if (km < 1.2) return { minutes: Math.max(5, Math.round((km / 4.5) * 60)), roadKm: Math.round(km * 10) / 10 };
  const road = km * 1.3;
  return { minutes: Math.round((road / 50) * 60 + 10), roadKm: Math.round(road * 10) / 10 };
}

// ---------- weather ----------

export function summariseWeather(forecast: Forecast | null, date: string, start: string, end: string): WeatherSummary | null {
  if (!forecast?.hours.length) return null;
  // Forecast times are UTC; Ireland is UTC+0 in winter and UTC+1 in summer.
  const month = Number(date.slice(5, 7));
  const offset = month >= 4 && month <= 10 ? 1 : 0;
  const from = toMin(start) - offset * 60;
  const to = toMin(end) - offset * 60;
  const inSlot = forecast.hours.filter((h) => {
    if (h.time.slice(0, 10) !== date) return false;
    const m = Number(h.time.slice(11, 13)) * 60 + Number(h.time.slice(14, 16));
    return m >= from && m <= to;
  });
  if (!inSlot.length) return null;
  const rain = Math.round(inSlot.reduce((s, h) => s + h.rainMm, 0) * 10) / 10;
  const temps = inSlot.map((h) => h.tempC).filter((t): t is number => t !== null);
  const rainy = rain >= 1.5 || inSlot.some((h) => h.rainMm >= 0.6);
  const tMin = temps.length ? Math.round(Math.min(...temps)) : null;
  const tMax = temps.length ? Math.round(Math.max(...temps)) : null;
  const t = tMin !== null ? (tMin === tMax ? `${tMin}°C` : `${tMin}–${tMax}°C`) : "";
  return {
    rainy,
    rainMm: rain,
    tempMin: tMin,
    tempMax: tMax,
    summary: rainy ? `Rain likely (${rain} mm)${t ? `, ${t}` : ""}. Leaning indoors.` : `Mostly dry${t ? `, ${t}` : ""}.`,
  };
}

// ---------- planning ----------

const KIND_WORD: Record<Kind, string> = {
  walk: "walk", nature: "nature spot", beach: "beach", heritage: "heritage site", museum: "museum", music: "music",
  gig: "gig", club: "club night", pub: "pub", comedy: "comedy", theatre: "show", festival: "festival", family: "family fun",
  food: "food", market: "market", sport: "activity", water: "water sports", wellness: "spa", tour: "tour", talk: "talk",
  other: "visit",
};

type Candidate = (Place | FtEvent) & { distFromTown: number; base: number };
const isEvent = (p: Place | FtEvent): p is FtEvent => "startDate" in p;

function jitter(id: string, seed: number): number {
  let h = 2166136261 ^ seed;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return (h % 1000) / 1000;
}

function wantedKinds(req: PlanRequest): Set<Kind> {
  const kinds = new Set<Kind>();
  for (const i of req.interests) for (const k of INTEREST_KINDS[i]) kinds.add(k);
  return kinds;
}

/** Score before travel, timing and variety are considered. */
function baseScore(p: Place | FtEvent, req: PlanRequest, kinds: Set<Kind>, rainy: boolean): number | null {
  if (req.who === "kids" && p.adultsOnly) return null;
  if (req.avoid?.includes(p.id)) return null;
  if (req.budget !== null && p.price !== null && p.price > req.budget) return null;
  // Places to eat are only a part of a plan, never all of it: they're picked as a meal stop.
  let s = kinds.size ? (kinds.has(p.kind) ? 3 : 0.3) : 1;
  if (req.interests.includes("rainy")) s += p.indoor ? 2 : -1;
  if (req.interests.includes("family") && p.kidFriendly) s += 1.5;
  if (req.who === "kids") s += p.kidFriendly ? 1.5 : -1;
  if (isEvent(p)) s += 1.2; // something on that day beats a place that's always there
  if (rainy) s += p.indoor ? 2 : -3;
  if (p.url) s += 0.3;
  if (req.budget !== null && req.budget <= 10 && p.free) s += 0.7;
  if (p.kind === "other" || p.kind === "tour") s -= 0.5;
  s += tasteBoost(req.taste, p.kind);
  if (req.prefer?.includes(p.id)) s += 6;
  // Registered trails are the most reliable walks (length and difficulty are known).
  if (p.source === "sport-ireland-trails" && kinds.has("walk")) s += 0.8;
  return s;
}

interface Ctx {
  req: PlanRequest;
  month: number;
  pool: Candidate[];
  seed: number;
  banned: Set<string>;
  used: Set<string>;
  kindCount: Map<Kind, number>;
  spent: number;
  slotStart: number;
  long: boolean;
}

interface Timed {
  begin: number;
  finish: number;
  trip: ReturnType<typeof travel>;
  wait: number;
  notes: string[];
  fixed: boolean;
}

/** When a candidate can fit, given where we are and when, or null if it can't. */
function fit(c: Candidate, ctx: Ctx, cursor: number, at: { lat: number; lng: number }, windowEnd: number): Timed | null {
  const trip = travel(distanceKm(at.lat, at.lng, c.lat, c.lng));
  const arrive = cursor + trip.minutes;
  const notes: string[] = [];
  let duration = c.durationMin;
  let open: number;
  let close: number;
  let fixedStart: number | null = null;
  if (isEvent(c)) {
    fixedStart = c.startTime ? toMin(c.startTime) : usualEventStart(c.kind);
    [open, close] = fixedStart !== null ? [fixedStart, fixedStart + duration] : usualHours(c.kind, c.indoor, ctx.month);
    if (!c.startTime) notes.push(fixedStart !== null ? `Usually starts around ${fmt(fixedStart)}. Check the time.` : "Times not listed. Check before you go.");
    if (c.recurring && c.startDate !== c.endDate) notes.push("Runs on selected dates. Check it's on this day.");
  } else {
    [open, close] = usualHours(c.kind, c.indoor, ctx.month);
  }
  if (fixedStart !== null && arrive > fixedStart + 10) return null; // would miss the start
  const begin = Math.max(arrive, open, fixedStart ?? 0);
  const wait = begin - arrive;
  if (wait > (fixedStart !== null ? 45 : 60)) return null;
  const latest = Math.min(windowEnd, close);
  if (fixedStart !== null) {
    // A show that runs past the end of the slot is fine if most of it fits.
    duration = Math.min(duration, windowEnd - begin);
    if (duration < Math.min(90, c.durationMin)) return null;
  } else {
    if (begin + duration > latest) duration = latest - begin;
    if (duration < Math.min(45, c.durationMin)) return null;
  }
  const finish = begin + duration;
  if (finish > windowEnd) return null;
  if (ctx.req.budget !== null && c.price !== null && ctx.spent + c.price > ctx.req.budget) return null;
  if ("section" in c && c.section) notes.push("A long trail: walk part of it.");
  return { begin, finish, trip, wait, notes, fixed: fixedStart !== null };
}

function toStop(c: Candidate, t: Timed): PlanStop {
  return {
    id: c.id,
    name: c.name,
    kind: c.kind,
    source: c.source,
    url: c.url,
    county: c.county,
    lat: c.lat,
    lng: c.lng,
    start: fmt(t.begin),
    end: fmt(t.finish),
    travelMin: t.trip.minutes,
    travelKm: t.trip.roadKm,
    price: c.price,
    free: c.free,
    indoor: c.indoor,
    summary: c.summary,
    venue: isEvent(c) ? c.venue : null,
    notes: t.notes,
  };
}

function take(ctx: Ctx, c: Candidate) {
  ctx.used.add(c.id);
  ctx.kindCount.set(c.kind, (ctx.kindCount.get(c.kind) ?? 0) + 1);
  ctx.spent += c.price ?? 0;
}

/**
 * Greedily fills [cursor, windowEnd] with stops. When `then` is given, every stop
 * must leave enough time to travel on to it (the anchor event).
 */
function fill(ctx: Ctx, cursor: number, at: { lat: number; lng: number }, windowEnd: number, maxStops: number, then?: { lat: number; lng: number }): { stops: PlanStop[]; cursor: number; at: { lat: number; lng: number } } {
  const stops: PlanStop[] = [];
  while (stops.length < maxStops && windowEnd - cursor >= 40) {
    const mealTime = (cursor >= 12 * 60 + 15 && cursor <= 14 * 60) || (cursor >= 17 * 60 + 45 && cursor <= 19 * 60 + 30);
    const hadFood = (ctx.kindCount.get("food") ?? 0) > 0;
    let best: { c: Candidate; t: Timed; score: number } | null = null;
    for (const c of ctx.pool) {
      if (ctx.used.has(c.id) || ctx.banned.has(c.id)) continue;
      if (c.kind === "food" && !(ctx.long && mealTime && !hadFood) && !ctx.req.interests.includes("food")) continue;
      const onward = then ? travel(distanceKm(c.lat, c.lng, then.lat, then.lng)).minutes : 0;
      const t = fit(c, ctx, cursor, at, windowEnd - onward);
      if (!t) continue;
      let score = c.base;
      score -= t.trip.roadKm / 10;
      score -= t.wait / (t.fixed ? 45 : 30);
      score -= (ctx.kindCount.get(c.kind) ?? 0) * 2.2;
      if (stops.length && stops[stops.length - 1].kind === c.kind) score -= 1.5;
      if (c.kind === "food" && ctx.long && mealTime && !hadFood) score += 2.5;
      score += jitter(c.id, ctx.seed) * 1.2;
      if (!best || score > best.score) best = { c, t, score };
    }
    if (!best) break;
    stops.push(toStop(best.c, best.t));
    take(ctx, best.c);
    cursor = best.t.finish;
    at = { lat: best.c.lat, lng: best.c.lng };
  }
  return { stops, cursor, at };
}

function buildOne(pool: Candidate[], req: PlanRequest, town: Town, seed: number, banned: Set<string>): { stops: PlanStop[]; ids: string[] } {
  const slotStart = toMin(req.start);
  const slotEnd = toMin(req.end) <= slotStart ? toMin(req.end) + 24 * 60 : toMin(req.end);
  const ctx: Ctx = {
    req,
    month: Number(req.date.slice(5, 7)) - 1,
    pool,
    seed,
    banned,
    used: new Set(),
    kindCount: new Map(),
    spent: 0,
    slotStart,
    long: slotEnd - slotStart >= 210,
  };
  const home = { lat: town.lat, lng: town.lng };

  // 1. Anchor: the best timed event that fits the slot (a gig at 8, a show at 7:30).
  const kinds = wantedKinds(req);
  let anchor: { c: Candidate; t: Timed; score: number } | null = null;
  for (const c of pool) {
    if (!isEvent(c) || banned.has(c.id)) continue;
    const startAt = c.startTime ? toMin(c.startTime) : usualEventStart(c.kind);
    if (startAt === null || startAt < slotStart) continue;
    if (kinds.size && !kinds.has(c.kind) && !req.prefer?.includes(c.id)) continue;
    const t = fit(c, ctx, startAt - travel(c.distFromTown).minutes, home, slotEnd);
    if (!t) continue;
    const score = c.base - c.distFromTown / 8 + jitter(c.id, seed) * 1.2;
    if (!anchor || score > anchor.score) anchor = { c, t, score };
  }

  if (!anchor) {
    const { stops } = fill(ctx, slotStart, home, slotEnd, 4);
    return { stops, ids: stops.map((s) => s.id) };
  }

  // 2. Fill the time before the anchor (finishing in time to travel to it), then after it.
  take(ctx, anchor.c);
  const anchorBegin = anchor.t.begin;
  const before = fill(ctx, slotStart, home, anchorBegin, 2, anchor.c);
  const tripIn = travel(distanceKm(before.at.lat, before.at.lng, anchor.c.lat, anchor.c.lng));
  const anchorStop = toStop(anchor.c, { ...anchor.t, trip: tripIn });
  const after = fill(ctx, anchor.t.finish, { lat: anchor.c.lat, lng: anchor.c.lng }, slotEnd, 1);
  const stops = [...before.stops, anchorStop, ...after.stops];
  return { stops, ids: stops.map((s) => s.id) };
}

function titleFor(stops: PlanStop[]): string {
  const words = [...new Set(stops.map((s) => KIND_WORD[s.kind]))];
  if (!words.length) return "Free time";
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
  if (words.length === 1) return cap(words[0]);
  return cap(`${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`);
}

export function plan(
  req: PlanRequest,
  town: Town,
  places: Place[],
  events: FtEvent[],
  forecast: Forecast | null = null,
): PlanResult {
  const notes: string[] = [];
  const weather = summariseWeather(forecast, req.date, req.start, req.end);
  if (!weather) notes.push("No forecast for this time. Check met.ie before you go.");
  const kinds = wantedKinds(req);
  const radius = Math.max(2, Math.min(req.radiusKm, 80));

  const pool: Candidate[] = [];
  const consider = (p: Place | FtEvent) => {
    const d = distanceKm(town.lat, town.lng, p.lat, p.lng);
    if (d > radius) return;
    const base = baseScore(p, req, kinds, weather?.rainy ?? false);
    if (base === null) return;
    pool.push({ ...p, distFromTown: d, base });
  };
  for (const p of places) consider(p);
  for (const e of events) if (e.startDate <= req.date && req.date <= e.endDate) consider(e);
  // Keep the search quick: the best few hundred by base score, food always included for meal stops.
  pool.sort((a, b) => b.base - a.base || a.distFromTown - b.distFromTown || a.id.localeCompare(b.id));
  const trimmed = [...pool.filter((p) => p.kind !== "food").slice(0, 400), ...pool.filter((p) => p.kind === "food").slice(0, 60)];

  const plans: Plan[] = [];
  const banned = new Set<string>();
  const seen = new Set<string>();
  for (let seed = 1; seed <= 6 && plans.length < 3; seed++) {
    const { stops, ids } = buildOne(trimmed, req, town, seed, banned);
    if (!stops.length) break;
    const key = [...ids].sort().join("|");
    // The next plan must start somewhere different, so the alternatives really differ.
    banned.add(ids[0]);
    if (seen.has(key)) continue;
    seen.add(key);
    const known = stops.reduce((s, x) => s + (x.price ?? 0), 0);
    plans.push({
      id: `plan-${seed}-${ids[0]}`,
      title: titleFor(stops),
      stops,
      knownCostPerPerson: Math.round(known * 100) / 100,
      priceUnknown: stops.some((s) => s.price === null && !s.free),
      hoursTypical: stops.some((s) => s.source === "failte-attractions" && !["walk", "nature", "beach"].includes(s.kind)),
    });
  }
  if (!plans.length) notes.push("Nothing fits this slot. Try a longer time, a wider area or different interests.");
  return { plans, weather, considered: pool.length, notes };
}

// ---------- swipe deck ----------

export interface DeckCard {
  id: string;
  name: string;
  kind: Kind;
  source: Place["source"];
  url: string | null;
  county: string;
  lat: number;
  lng: number;
  distanceKm: number;
  price: number | null;
  free: boolean;
  indoor: boolean;
  kidFriendly: boolean;
  summary: string;
  venue: string | null;
  /** "8pm-ish", "Starts 19:30", "Open usual hours", … */
  when: string;
  event: boolean;
  lengthKm?: number;
  difficulty?: string;
}

/**
 * Everything on near the chosen town that day, best first for this person, for
 * swiping. Cards already swiped (`seen`) are left out.
 */
export function deck(req: PlanRequest, town: Town, places: Place[], events: FtEvent[], seen: Set<string>, limit = 40, seed = 1): DeckCard[] {
  const kinds = wantedKinds(req);
  const radius = Math.max(2, Math.min(req.radiusKm, 80));
  const month = Number(req.date.slice(5, 7)) - 1;
  const slotStart = toMin(req.start);
  const slotEnd = toMin(req.end) <= slotStart ? toMin(req.end) + 24 * 60 : toMin(req.end);
  const scored: { card: DeckCard; score: number }[] = [];
  const add = (p: Place | FtEvent) => {
    if (seen.has(p.id)) return;
    if (p.kind === "food" && !req.interests.includes("food")) return;
    const d = distanceKm(town.lat, town.lng, p.lat, p.lng);
    if (d > radius) return;
    const base = baseScore(p, req, kinds, false);
    if (base === null) return;
    // Only things you could actually do in the slot.
    let when: string;
    if (isEvent(p)) {
      const start = p.startTime ? toMin(p.startTime) : usualEventStart(p.kind);
      if (start !== null && (start < slotStart - 30 || start > slotEnd - 45)) return;
      when = p.startTime ? `Starts ${p.startTime}` : start !== null ? `Usually around ${fmt(start)}` : "Daytime, times not listed";
    } else {
      const [open, close] = usualHours(p.kind, p.indoor, month);
      if (Math.min(close, slotEnd) - Math.max(open, slotStart) < 45) return;
      when = ["walk", "nature", "beach", "water"].includes(p.kind) ? "Any time in daylight" : `Usually open ${fmt(open)}–${fmt(close)}`;
    }
    const score = base - d / 10 + jitter(p.id, seed) * 1.5;
    scored.push({
      score,
      card: {
        id: p.id,
        name: p.name,
        kind: p.kind,
        source: p.source,
        url: p.url,
        county: p.county,
        lat: p.lat,
        lng: p.lng,
        distanceKm: Math.round(d * 10) / 10,
        price: p.price,
        free: p.free,
        indoor: p.indoor,
        kidFriendly: p.kidFriendly,
        summary: p.summary,
        venue: isEvent(p) ? p.venue : null,
        when,
        event: isEvent(p),
        lengthKm: p.lengthKm,
        difficulty: p.difficulty,
      },
    });
  };
  for (const p of places) add(p);
  for (const e of events) if (e.startDate <= req.date && req.date <= e.endDate) add(e);
  scored.sort((a, b) => b.score - a.score || a.card.id.localeCompare(b.card.id));
  // Mix it up: don't show more than three of one kind in a row near the top.
  const out: DeckCard[] = [];
  const rest: DeckCard[] = [];
  for (const { card } of scored) {
    const last3 = out.slice(-3);
    if (last3.length === 3 && last3.every((c) => c.kind === card.kind)) rest.push(card);
    else out.push(card);
    if (out.length >= limit) break;
  }
  return [...out, ...rest].slice(0, limit);
}
