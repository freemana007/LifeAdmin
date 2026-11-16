/**
 * Skiddle events API (needs SKIDDLE_API_KEY). Off unless a key is set.
 * Strong on gigs, club nights and comedy, with real dates, times and prices.
 * https://www.skiddle.com/api/ · Listings must credit Skiddle and link back (the card links do).
 */
import type { FtEvent, Kind } from "../types.js";
import { clip, DEFAULT_DURATION, hashId, num, round5, safeUrl } from "../util.js";

export interface SkiddleEvent {
  id: string | number;
  EventCode?: string;
  eventname?: string;
  cancelled?: string | number | boolean;
  link?: string;
  description?: string;
  date?: string; // YYYY-MM-DD
  startdate?: string; // ISO with time
  enddate?: string;
  openingtimes?: { doorsopen?: string };
  minage?: string | number;
  entryprice?: string;
  venue?: { name?: string; town?: string; latitude?: number | string; longitude?: number | string; country?: string };
}

const CODE_KIND: Record<string, Kind> = {
  LIVE: "gig",
  CLUB: "club",
  COMEDY: "comedy",
  THEATRE: "theatre",
  FEST: "festival",
  KIDS: "family",
  EXHIB: "exhibition",
  ARTS: "exhibition",
  BARPUB: "pub",
  SPORT: "sport",
};

/** Searches around these centres cover the island; results are merged by id. */
export const SKIDDLE_CENTRES: { name: string; lat: number; lng: number }[] = [
  { name: "Dublin", lat: 53.3498, lng: -6.2603 },
  { name: "Cork", lat: 51.8985, lng: -8.4756 },
  { name: "Galway", lat: 53.2707, lng: -9.0568 },
  { name: "Limerick", lat: 52.6638, lng: -8.6267 },
  { name: "Waterford", lat: 52.2593, lng: -7.1101 },
  { name: "Sligo", lat: 54.2766, lng: -8.4761 },
  { name: "Belfast", lat: 54.5973, lng: -5.9301 },
];

const ISLAND = { minLat: 51.3, maxLat: 55.5, minLng: -10.7, maxLng: -5.3 };

export function mapSkiddle(results: SkiddleEvent[]): FtEvent[] {
  const out: FtEvent[] = [];
  for (const e of results) {
    const kind = CODE_KIND[(e.EventCode ?? "").toUpperCase()];
    if (!kind || !e.eventname || !e.date) continue;
    if (e.cancelled === true || e.cancelled === 1 || e.cancelled === "1") continue;
    const lat = num(e.venue?.latitude);
    const lng = num(e.venue?.longitude);
    if (lat === null || lng === null) continue;
    if (lat < ISLAND.minLat || lat > ISLAND.maxLat || lng < ISLAND.minLng || lng > ISLAND.maxLng) continue;
    const time = (e.openingtimes?.doorsopen ?? e.startdate?.slice(11, 16) ?? "").match(/^(\d{1,2}):(\d{2})/);
    const price = num((e.entryprice ?? "").replace(/[^\d.]/g, "") || null);
    const endDate = e.enddate?.slice(0, 10);
    const minAge = num(e.minage);
    out.push({
      id: hashId("sk", e.id),
      source: "skiddle",
      name: e.eventname,
      kind,
      county: e.venue?.town ?? "",
      lat: round5(lat),
      lng: round5(lng),
      indoor: kind !== "festival" && kind !== "sport",
      durationMin: DEFAULT_DURATION[kind],
      price,
      free: price === 0 || /\bfree\b/i.test(e.entryprice ?? ""),
      kidFriendly: kind === "family" || (minAge !== null && minAge === 0),
      adultsOnly: kind === "club" || (minAge !== null && minAge >= 18),
      url: safeUrl(e.link),
      summary: clip(e.description ?? [e.venue?.name, e.venue?.town].filter(Boolean).join(", ")),
      startDate: e.date,
      // Overnight club nights end the next morning; they're still "on" the night they start.
      endDate: e.date,
      startTime: time ? `${time[1].padStart(2, "0")}:${time[2]}` : null,
      venue: e.venue?.name ?? null,
      recurring: Boolean(endDate && endDate > e.date && kind === "festival"),
    });
  }
  return out;
}

type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/**
 * Upcoming events (next `days` days) around each centre. Stops early when the time
 * budget is used up, keeping what it has, so it fits a 30-second scheduled job.
 */
export async function fetchSkiddle(apiKey: string, now = new Date(), opts: { days?: number; budgetMs?: number; fetcher?: Fetcher } = {}): Promise<FtEvent[]> {
  const get: Fetcher = opts.fetcher ?? ((url) => fetch(url, { signal: AbortSignal.timeout(10_000) }));
  const deadline = Date.now() + (opts.budgetMs ?? 18_000);
  const minDate = now.toISOString().slice(0, 10);
  const maxDate = new Date(now.getTime() + (opts.days ?? 60) * 86_400_000).toISOString().slice(0, 10);
  const byId = new Map<string, FtEvent>();
  let firstError: Error | null = null;
  await Promise.all(
    SKIDDLE_CENTRES.map(async (c) => {
      for (let offset = 0; offset < 500 && Date.now() < deadline; offset += 100) {
        const q = new URLSearchParams({
          api_key: apiKey,
          latitude: String(c.lat),
          longitude: String(c.lng),
          radius: "35", // miles
          minDate,
          maxDate,
          limit: "100",
          offset: String(offset),
          order: "date",
          description: "1",
        });
        try {
          const res = await get(`https://www.skiddle.com/api/v1/events/search/?${q}`);
          if (!res.ok) throw new Error(`Skiddle → HTTP ${res.status}`);
          const body = (await res.json()) as { error?: number | string; errormessage?: string; totalcount?: string | number; results?: SkiddleEvent[] };
          if (body.error && String(body.error) !== "0") throw new Error(`Skiddle → ${body.errormessage ?? body.error}`);
          for (const e of mapSkiddle(body.results ?? [])) byId.set(e.id, e);
          if (offset + 100 >= Number(body.totalcount ?? 0)) break;
        } catch (e) {
          firstError ??= e as Error;
          break;
        }
      }
    }),
  );
  // Only fail the source if nothing at all came back (a bad key, or Skiddle down).
  if (!byId.size && firstError) throw firstError;
  return [...byId.values()];
}
