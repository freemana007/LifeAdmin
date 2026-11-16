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
  [/\bCraft\b/, "class"],
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

/**
 * Fáilte's "Event Type" column is almost always just "Event", so the kind comes
 * from the words used. Rules are tried on the name first (most reliable), then on
 * the name and description together. First match wins, most specific first.
 */
const EVENT_RULES: [RegExp, Kind][] = [
  [/\b(club night|dj set|dj|nightclub|disco|rave|silent disco)\b/i, "club"],
  [/\b(comedy|comedian|stand-up|stand up|improv)\b/i, "comedy"],
  [/\b(panto|pantomime|santa|santa's grotto|elf|kids|children's|family fun|toddler|storytime|story time|teddy|puppet)\b/i, "family"],
  [/\b(gig|concert|live music|in concert|band|orchestra|trad session|traditional music|trad|singer|songwriter|choir|jazz|blues|acoustic|tribute|symphony|recital|carols?)\b/i, "gig"],
  [/\b(theatre|play\b(?! area)|musical|opera|ballet|drama|cinema|film|screening|riverdance|dance show|circus|magic show|panto)\b/i, "theatre"],
  [/\b(exhibition|exhibit|gallery|art show|artwork|installation|retrospective)\b/i, "exhibition"],
  [/\b(workshop|masterclass|master class|class|classes|course|lesson|cocktail|craft|painting|pottery|wreath|cookery|cooking)\b/i, "class"],
  [/\b(market|craft fair|food fair|christmas fair|car boot)\b/i, "market"],
  [/\b(supper club|tasting|brunch|dinner|feast|food festival|afternoon tea)\b/i, "food"],
  [/\b(ice skating|skating|match|race day|races|parkrun|marathon|5k|10k|gaa|rugby|hurling|football|swim|yoga|fitness)\b/i, "sport"],
  [/\b(walk|walking|hike|trail|forest bathing|ramble)\b/i, "walk"],
  [/\b(tour|tours|guided|audio tour|ghost tour)\b/i, "tour"],
  [/\b(talk|lecture|reading|in conversation|book launch|seminar|discussion|symposium|poetry)\b/i, "talk"],
  [/\b(festival|fest|fleadh)\b/i, "festival"],
];

export function kindFromEvent(type: string, name: string, description: string): Kind {
  for (const text of [name, `${name} ${description}`]) {
    for (const [re, kind] of EVENT_RULES) if (re.test(text)) return kind;
  }
  if (/festival/i.test(type)) return "festival";
  if (/market/i.test(type)) return "market";
  return "other";
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
      indoor: !["walk", "sport", "market", "festival", "tour"].includes(kind) || /\b(indoor|ice rink|leisure centre)\b/i.test(r["Name"]),
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
