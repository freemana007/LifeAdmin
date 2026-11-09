/**
 * Ticketmaster Discovery API (needs TICKETMASTER_API_KEY). Off unless a key is set.
 * https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
 */
import type { FtEvent, Kind } from "../types.js";
import { DEFAULT_DURATION, hashId, num, round5, safeUrl, titleCounty } from "../util.js";

interface TmEvent {
  id: string;
  name: string;
  url?: string;
  dates?: { start?: { localDate?: string; localTime?: string } };
  classifications?: { segment?: { name?: string }; genre?: { name?: string } }[];
  priceRanges?: { min?: number }[];
  _embedded?: { venues?: { name?: string; city?: { name?: string }; state?: { name?: string }; location?: { latitude?: string; longitude?: string } }[] };
}

function kindOf(e: TmEvent): Kind {
  const seg = e.classifications?.[0]?.segment?.name ?? "";
  const genre = e.classifications?.[0]?.genre?.name ?? "";
  if (/comedy/i.test(genre)) return "comedy";
  if (/dance|electronic/i.test(genre) && /club|night/i.test(e.name)) return "club";
  if (/music/i.test(seg)) return "gig";
  if (/sports/i.test(seg)) return "sport";
  if (/family/i.test(genre) || /family/i.test(seg)) return "family";
  if (/arts|theatre/i.test(seg)) return "theatre";
  return "other";
}

export function mapTicketmaster(body: { _embedded?: { events?: TmEvent[] } }): FtEvent[] {
  const out: FtEvent[] = [];
  for (const e of body._embedded?.events ?? []) {
    const venue = e._embedded?.venues?.[0];
    const lat = num(venue?.location?.latitude);
    const lng = num(venue?.location?.longitude);
    const date = e.dates?.start?.localDate;
    if (lat === null || lng === null || !date) continue;
    const kind = kindOf(e);
    const price = num(e.priceRanges?.[0]?.min);
    out.push({
      id: hashId("tm", e.id),
      source: "ticketmaster",
      name: e.name,
      kind,
      county: titleCounty(venue?.state?.name ?? venue?.city?.name ?? ""),
      lat: round5(lat),
      lng: round5(lng),
      indoor: kind !== "sport",
      durationMin: DEFAULT_DURATION[kind],
      price,
      free: price === 0,
      kidFriendly: kind === "family",
      adultsOnly: kind === "club",
      url: safeUrl(e.url),
      summary: [venue?.name, venue?.city?.name].filter(Boolean).join(", "),
      startDate: date,
      endDate: date,
      startTime: e.dates?.start?.localTime?.slice(0, 5) ?? null,
      venue: venue?.name ?? null,
      recurring: false,
    });
  }
  return out;
}

export async function fetchTicketmaster(apiKey: string, now = new Date()): Promise<FtEvent[]> {
  const out: FtEvent[] = [];
  const start = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  for (let page = 0; page < 5; page++) {
    const q = new URLSearchParams({ apikey: apiKey, countryCode: "IE", size: "200", page: String(page), sort: "date,asc", startDateTime: start });
    const res = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${q}`, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Ticketmaster → HTTP ${res.status}`);
    const body = (await res.json()) as { _embedded?: { events?: TmEvent[] }; page?: { totalPages?: number } };
    out.push(...mapTicketmaster(body));
    if (page + 1 >= (body.page?.totalPages ?? 1)) break;
  }
  return out;
}
