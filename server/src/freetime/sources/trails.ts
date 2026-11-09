/**
 * Sport Ireland – Get Ireland Active trailheads (National Trails Register), CC BY 4.0.
 * https://data.gov.ie/dataset/getirelandactive_trailheads
 */
import type { Kind, Place } from "../types.js";
import { clip, hashId, num, round5, safeUrl, titleCounty } from "../util.js";

export const TRAILS_URL =
  "https://services-eu1.arcgis.com/CltcWyRoZmdwaB7T/arcgis/rest/services/GetIrelandActiveTrailHeads/FeatureServer/0/query";

const FIELDS = ["Name", "Latitude", "Longitude", "Activity", "TrailActivity", "Description", "Website", "County", "LengthKm", "TimeToComplete", "Difficulty", "DogsAllowed", "NearestTownStart", "TrailType"];

export interface TrailAttrs {
  Name?: string;
  Latitude?: number;
  Longitude?: number;
  Activity?: string;
  TrailActivity?: string;
  Description?: string;
  Website?: string;
  County?: string;
  LengthKm?: number;
  TimeToComplete?: string;
  Difficulty?: string;
  DogsAllowed?: string;
  NearestTownStart?: string;
  TrailType?: string;
}

/** "1.5 hours", "45 mins", "2 to 3 days" → minutes (upper bound). */
export function parseDuration(s: string | undefined): number | null {
  if (!s) return null;
  const t = s.toLowerCase();
  const nums = (t.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  if (!nums.length) return null;
  const n = Math.max(...nums);
  if (/day/.test(t)) return n * 8 * 60;
  if (/hour|hr/.test(t)) return Math.round(n * 60);
  if (/min/.test(t)) return Math.round(n);
  return null;
}

const MAX_VISIT = 4 * 60;

export function mapTrails(features: { attributes: TrailAttrs }[]): Place[] {
  const out: Place[] = [];
  const seen = new Set<string>();
  for (const { attributes: a } of features) {
    const lat = num(a.Latitude);
    const lng = num(a.Longitude);
    if (!a.Name || lat === null || lng === null) continue;
    const key = `${a.Name}|${lat.toFixed(3)}|${lng.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const activity = `${a.Activity ?? ""} ${a.TrailActivity ?? ""}`;
    const kind: Kind = /paddl|kayak|canoe|snorkel|swim/i.test(activity) ? "water" : /cycl|horse/i.test(activity) ? "sport" : "walk";
    const lengthKm = num(a.LengthKm) ?? undefined;
    const speedKmH = kind === "sport" ? 12 : 4;
    const est = parseDuration(a.TimeToComplete) ?? (lengthKm ? Math.round((lengthKm / speedKmH) * 60) : 90);
    const section = est > MAX_VISIT;
    const easy = /easy/i.test(a.Difficulty ?? "");
    out.push({
      id: hashId("tr", key),
      source: "sport-ireland-trails",
      name: a.Name,
      kind,
      county: titleCounty(a.County ?? ""),
      lat: round5(lat),
      lng: round5(lng),
      indoor: false,
      durationMin: Math.max(30, Math.min(est, section ? 150 : MAX_VISIT)),
      price: 0,
      free: true,
      kidFriendly: easy && (lengthKm ?? 99) <= 8,
      adultsOnly: false,
      url: safeUrl(a.Website),
      summary: clip(
        [lengthKm ? `${lengthKm} km` : "", a.Difficulty && a.Difficulty !== "None" ? a.Difficulty : "", a.TrailType ?? "", a.DogsAllowed === "Yes" ? "Dogs allowed" : a.DogsAllowed === "No" ? "No dogs" : ""]
          .filter(Boolean)
          .join(" · ") || clip(a.Description ?? ""),
      ),
      lengthKm,
      difficulty: a.Difficulty && a.Difficulty !== "None" ? a.Difficulty : undefined,
      dogs: a.DogsAllowed === "Yes" ? true : a.DogsAllowed === "No" ? false : null,
      section,
    });
  }
  return out;
}

export async function fetchTrails(): Promise<Place[]> {
  const features: { attributes: TrailAttrs }[] = [];
  for (let offset = 0; offset < 20000; offset += 2000) {
    const q = new URLSearchParams({
      where: "1=1",
      outFields: FIELDS.join(","),
      returnGeometry: "false",
      f: "json",
      resultOffset: String(offset),
      resultRecordCount: "2000",
    });
    const res = await fetch(`${TRAILS_URL}?${q}`, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`trails → HTTP ${res.status}`);
    const body = (await res.json()) as { features?: { attributes: TrailAttrs }[]; exceededTransferLimit?: boolean; error?: { message: string } };
    if (body.error) throw new Error(`trails → ${body.error.message}`);
    features.push(...(body.features ?? []));
    if (!body.exceededTransferLimit) break;
  }
  return mapTrails(features);
}
