/**
 * Builds the Free time dataset from every source. Each source is optional:
 * a failure or a missing key is recorded in `sources` and the rest still load.
 */
import { fetchAttractions, fetchEvents } from "./sources/failte.js";
import { fetchSkiddle } from "./sources/skiddle.js";
import { fetchTicketmaster } from "./sources/ticketmaster.js";
import { fetchTrails } from "./sources/trails.js";
import type { Dataset, FtEvent, Place, SourceStatus } from "./types.js";

export const SOURCE_INFO: Record<SourceStatus["id"], Omit<SourceStatus, "ok" | "count" | "updatedAt" | "error">> = {
  "failte-attractions": {
    id: "failte-attractions",
    name: "Fáilte Ireland – Activities and Attractions",
    licence: "CC BY 4.0",
    credit: "Contains Fáilte Ireland data",
    url: "https://data.gov.ie/dataset/tourism-activities-and-attractions",
  },
  "failte-events": {
    id: "failte-events",
    name: "Fáilte Ireland – Events",
    licence: "CC BY 4.0",
    credit: "Contains Fáilte Ireland data",
    url: "https://data.gov.ie/dataset/events",
  },
  "sport-ireland-trails": {
    id: "sport-ireland-trails",
    name: "Get Ireland Active – Sport Ireland trails",
    licence: "CC BY 4.0",
    credit: "Get Ireland Active – Sport Ireland",
    url: "https://data.gov.ie/dataset/getirelandactive_trailheads",
  },
  ticketmaster: {
    id: "ticketmaster",
    name: "Ticketmaster",
    licence: "Ticketmaster Discovery API terms",
    credit: "Event listings from Ticketmaster",
    url: "https://developer.ticketmaster.com/",
  },
  skiddle: {
    id: "skiddle",
    name: "Skiddle",
    licence: "Skiddle API terms",
    credit: "Event listings from Skiddle",
    url: "https://www.skiddle.com/",
  },
  "met-eireann": {
    id: "met-eireann",
    name: "Met Éireann forecast",
    licence: "CC BY 4.0",
    credit: "Forecast from Met Éireann",
    url: "https://www.met.ie/",
  },
};

export async function buildDataset(opts: { ticketmasterKey?: string; skiddleKey?: string; now?: Date } = {}): Promise<Dataset> {
  const now = opts.now ?? new Date();
  const places: Place[] = [];
  const events: FtEvent[] = [];
  const sources: SourceStatus[] = [];
  const run = async <T extends Place>(id: SourceStatus["id"], fn: () => Promise<T[]>, into: T[]) => {
    try {
      const rows = await fn();
      into.push(...rows);
      sources.push({ ...SOURCE_INFO[id], ok: true, count: rows.length, updatedAt: now.toISOString() });
    } catch (e) {
      sources.push({ ...SOURCE_INFO[id], ok: false, count: 0, updatedAt: null, error: (e as Error).message });
    }
  };
  await Promise.all([
    run("failte-attractions", fetchAttractions, places),
    run("sport-ireland-trails", fetchTrails, places),
    run("failte-events", fetchEvents, events as FtEvent[]),
    opts.ticketmasterKey
      ? run("ticketmaster", () => fetchTicketmaster(opts.ticketmasterKey!, now), events as FtEvent[])
      : Promise.resolve(void sources.push({ ...SOURCE_INFO.ticketmaster, ok: false, count: 0, updatedAt: null, error: "No API key set" })),
    opts.skiddleKey
      ? run("skiddle", () => fetchSkiddle(opts.skiddleKey!, now), events as FtEvent[])
      : Promise.resolve(void sources.push({ ...SOURCE_INFO.skiddle, ok: false, count: 0, updatedAt: null, error: "No API key set" })),
  ]);
  // Keep the dataset focused on what's ahead.
  const today = now.toISOString().slice(0, 10);
  const upcoming = dedupeEvents(events.filter((e) => e.endDate >= today));
  return { generatedAt: now.toISOString(), sources, places, events: upcoming };
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The same gig can be listed by Fáilte, Ticketmaster and Skiddle. Keep one per
 * name, venue and date: the one with a start time, then a price, then a link.
 */
export function dedupeEvents(events: FtEvent[]): FtEvent[] {
  const rank = (e: FtEvent) => (e.startTime ? 4 : 0) + (e.price !== null ? 2 : 0) + (e.url ? 1 : 0);
  const best = new Map<string, FtEvent>();
  for (const e of events) {
    const key = `${norm(e.name)}|${norm(e.venue)}|${e.startDate}|${e.endDate}`;
    const prev = best.get(key);
    if (!prev || rank(e) > rank(prev)) best.set(key, e);
  }
  return [...best.values()];
}
