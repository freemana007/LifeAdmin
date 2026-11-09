/**
 * Fáilte Ireland open data (CC BY 4.0): "Tourism Activities and Attractions" and "Events".
 * https://data.gov.ie/dataset/tourism-activities-and-attractions · https://data.gov.ie/dataset/events
 */
import { parseCsv } from "../csv.js";
import type { FtEvent, Kind, Place } from "../types.js";
import { ADULT_KINDS, clip, DEFAULT_DURATION, round5, hashId, ieDate, INDOOR_KINDS, num, safeUrl, titleCounty } from "../util.js";

export const ATTRACTIONS_URL = "https://failteireland.azure-api.net/opendata-api/v2/attractions/csv";
export const EVENTS_URL = "https://failteireland.azure-api.net/opendata-api/v2/events/csv";

// Things that aren't a way to spend free time (shops, transport, language schools) are left out.
const SKIP_NAME = /\b(language (centre|center|school)|english language|school of english|college of english)\b/i;
const SKIP = /\b(Shopping Centres and Department Store|Food Shops|Transport|Coach|Embarkation Point|Tracing Your Ancestors|Driving Range|Specialised Retreat|Health Farm)\b/;

/** First matching rule wins, so the order is from most to least specific. */
const TAG_RULES: [RegExp, Kind][] = [
  [/\bBeach\b/, "beach"],
  [/\b(Walking|Park and Forest Walk|Forest Park)\b/, "walk"],
  [/\b(Museums and Attraction|Art Gallery)\b/, "museum"],
  [/\b(Historic Houses and Castle|Castle|Ruins|Abbeys and Monastery|Public Sculpture)\b/, "heritage"],
  [/\b(Visitor Farm|Swimming Pools and Water Park|Adventure Center)\b/, "family"],
  [/\b(Kayaking|Surfing|Sailing|Cruising|Swimming|Kitesurfing|Windsurfing|Angling|Boat)\b/, "water"],
  [/\b(Golf|Climbing|Horse Riding|Cycling|Bike Rental|Sports Venues|Fitness and Leisure)\b/, "sport"],
  [/\b(Spa and Wellness|Spa)\b/, "wellness"],
  [/\bCinema\b/, "theatre"],
  [/\bMusic\b/, "music"],
  [/\bPubs and Bar\b/, "pub"],
  [/\b(Nature and Wildlife|Natural Landscape|Gardens|Bird Watching|Island|Public Park)\b/, "nature"],
  [/\b(Restaurant|Cafe|Seafood|Food and Drink)\b/, "food"],
  [/\b(Tour|Day Tour|Food Trails and Tour)\b/, "tour"],
  [/\b(Churches|Church Abbey)\b/, "heritage"],
  [/\bCraft\b/, "talk"],
];

const FREE_KINDS = new Set<Kind>(["walk", "beach", "nature"]);

export function kindFromTags(tags: string): Kind {
  for (const [re, kind] of TAG_RULES) if (re.test(tags)) return kind;
  return "other";
}

export function mapAttractions(csvText: string): Place[] {
  const out: Place[] = [];
  for (const r of parseCsv(csvText)) {
    const tags = r["Tags"] ?? "";
    if (SKIP.test(tags) && !/\b(Attraction|Walking|Beach|Museums)\b/.test(tags)) continue;
    const lat = num(r["Latitude"]);
    const lng = num(r["Longitude"]);
    if (lat === null || lng === null || !r["Name"] || SKIP_NAME.test(r["Name"])) continue;
    if (/\bLearning\b/.test(tags) && !/\b(Attraction|Craft|Museums|Walking|Nature)\b/.test(tags)) continue;
    const kind = kindFromTags(tags);
    out.push({
      id: hashId("fa", r["Name"], lat, lng),
      source: "failte-attractions",
      name: r["Name"],
      kind,
      county: titleCounty(r["County"] ?? ""),
      lat: round5(lat),
      lng: round5(lng),
      indoor: INDOOR_KINDS.has(kind) || /\b(Swimming Pools|Cinema)\b/.test(tags),
      durationMin: DEFAULT_DURATION[kind],
      price: FREE_KINDS.has(kind) || /\b(Public Park|Public Sculpture|Churches)\b/.test(tags) ? 0 : null,
      free: FREE_KINDS.has(kind) || /\b(Public Park|Public Sculpture|Churches)\b/.test(tags),
      kidFriendly: ["beach", "walk", "nature", "family", "museum", "heritage"].includes(kind),
      adultsOnly: ADULT_KINDS.has(kind),
      url: safeUrl(r["Url"]),
      summary: clip(tags.split(",").map((t) => t.trim()).filter((t) => t && !/^(Activity|Experience|Attraction|Activity Operator)$/.test(t)).slice(0, 4).join(" · ")),
    });
  }
  return out;
}

const EVENT_RULES: [RegExp, Kind][] = [
  [/\b(club night|dj set|\bdj\b|nightclub|disco|rave)\b/i, "club"],
  [/\b(comedy|comedian|stand-up|stand up)\b/i, "comedy"],
  [/\b(panto|pantomime|santa|kids|children|family fun|toddler|storytime)\b/i, "family"],
  [/\b(gig|concert|live music|band|orchestra|trad session|traditional music|singer|choir|jazz|acoustic|tribute)\b/i, "gig"],
  [/\b(theatre|play by|musical|opera|ballet|drama|cinema|film screening)\b/i, "theatre"],
  [/\b(market|craft fair|food fair)\b/i, "market"],
  [/\b(match|race day|parkrun|marathon|gaa|rugby|hurling|football)\b/i, "sport"],
  [/\b(walk|hike|trail)\b/i, "walk"],
  [/\b(talk|lecture|workshop|exhibition|tour|reading)\b/i, "talk"],
];

export function kindFromEvent(type: string, name: string, description: string): Kind {
  const text = `${name} ${description}`;
  for (const [re, kind] of EVENT_RULES) if (re.test(text)) return kind;
  if (/festival/i.test(type) || /festival/i.test(name)) return "festival";
  if (/market/i.test(type)) return "market";
  return "talk";
}

export function mapEvents(csvText: string): FtEvent[] {
  const seen = new Set<string>();
  const out: FtEvent[] = [];
  for (const r of parseCsv(csvText)) {
    const start = ieDate(r["Start Date"] ?? "");
    const end = ieDate(r["End Date"] ?? "") ?? start;
    const lat = num(r["Latitude"]);
    const lng = num(r["Longitude"]);
    if (!start || !end || lat === null || lng === null || !r["Name"]) continue;
    const key = `${r["Name"]}|${r["Venue Name"]}|${start}|${end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const kind = kindFromEvent(r["Event Type"] ?? "", r["Name"], r["Description"] ?? "");
    const free = /^yes$/i.test(r["Is Free To Visit"] ?? "");
    const price = free ? 0 : num(r["Price"]);
    const time = (r["Start Time"] ?? "").match(/^(\d{1,2}):(\d{2})/);
    out.push({
      id: hashId("fe", key),
      source: "failte-events",
      name: r["Name"],
      kind,
      county: titleCounty(r["County"] ?? ""),
      lat: round5(lat),
      lng: round5(lng),
      indoor: kind !== "walk" && kind !== "sport" && kind !== "market" && kind !== "festival",
      durationMin: DEFAULT_DURATION[kind],
      price,
      free,
      kidFriendly: kind === "family" || kind === "market" || kind === "festival" || /\b(all ages|family)\b/i.test(r["Description"] ?? ""),
      adultsOnly: kind === "club" || /\b(18\+|over 18s?|adults only)\b/i.test(r["Description"] ?? ""),
      url: safeUrl(r["Booking URL"]) ?? safeUrl(r["Contact URL"]),
      summary: clip(r["Description"] ?? ""),
      startDate: start,
      endDate: end < start ? start : end,
      startTime: time ? `${time[1].padStart(2, "0")}:${time[2]}` : null,
      venue: r["Venue Name"] || null,
      recurring: /^yes$/i.test(r["Recurring Dates"] ?? ""),
    });
  }
  return out;
}

export async function fetchText(url: string, init: RequestInit = {}): Promise<string> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

export const fetchAttractions = async () => mapAttractions(await fetchText(ATTRACTIONS_URL));
export const fetchEvents = async () => mapEvents(await fetchText(EVENTS_URL));
