/**
 * Builds the Free time dataset from every source. Each source is optional:
 * a failure or a missing key is recorded in `sources` and the rest still load.
 */
import { fetchAttractions, fetchEvents } from "./sources/failte.js";
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
  "met-eireann": {
    id: "met-eireann",
    name: "Met Éireann forecast",
    licence: "CC BY 4.0",
    credit: "Forecast from Met Éireann",
    url: "https://www.met.ie/",
  },
};

export async function buildDataset(opts: { ticketmasterKey?: string; now?: Date } = {}): Promise<Dataset> {
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
  ]);
  // Keep the dataset focused on what's ahead.
  const today = now.toISOString().slice(0, 10);
  const upcoming = events.filter((e) => e.endDate >= today);
  return { generatedAt: now.toISOString(), sources, places, events: upcoming };
}
