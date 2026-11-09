/**
 * Met Éireann point forecast (CC BY 4.0). https://data.gov.ie/dataset/met-eireann-forecast-api
 * The XML has instant blocks (from == to) with temperature and period blocks (from < to) with precipitation.
 */
import type { Forecast, ForecastHour } from "../types.js";

export const MET_URL = "https://openaccess.pf.api.met.ie/metno-wdb2ts/locationforecast";

export function parseMetXml(xml: string, now = new Date()): Forecast {
  const temps = new Map<string, number>();
  const rain = new Map<string, number>();
  const re = /<time[^>]*from="([^"]+)"[^>]*to="([^"]+)"[^>]*>([\s\S]*?)<\/time>/g;
  for (let m; (m = re.exec(xml)); ) {
    const [, from, to, body] = m;
    if (from === to) {
      const t = body.match(/<temperature[^>]*value="(-?[\d.]+)"/);
      if (t) temps.set(from, Number(t[1]));
    } else {
      const p = body.match(/<precipitation[^>]*value="([\d.]+)"/);
      // Hourly blocks only: key by their end time, as an hour's total.
      if (p && Date.parse(to) - Date.parse(from) === 3_600_000) rain.set(to, Number(p[1]));
    }
  }
  const hours: ForecastHour[] = [...new Set([...temps.keys(), ...rain.keys()])]
    .sort()
    .map((time) => ({ time: new Date(time).toISOString(), tempC: temps.get(time) ?? null, rainMm: rain.get(time) ?? 0 }));
  return { hours, fetchedAt: now.toISOString() };
}

export async function fetchForecast(lat: number, lng: number): Promise<Forecast> {
  const res = await fetch(`${MET_URL}?lat=${lat.toFixed(4)};long=${lng.toFixed(4)}`, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Met Éireann → HTTP ${res.status}`);
  return parseMetXml(await res.text());
}
