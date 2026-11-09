import type { Kind } from "./types.js";

export const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

export const clip = (s: string, n = 140) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : t;
};

export const titleCounty = (c: string) => (c ? c.trim().toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()) : "");

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[€,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Stable short id from text (FNV-1a), so the same record keeps its id between refreshes. */
export function hashId(prefix: string, ...parts: (string | number | null | undefined)[]): string {
  let h = 0x811c9dc5;
  for (const ch of parts.join("|")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${prefix}-${h.toString(36)}`;
}

/** dd/mm/yyyy → yyyy-mm-dd */
export function ieDate(s: string): string | null {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

export const safeUrl = (u: string | null | undefined) => {
  const t = (u ?? "").trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

export const INDOOR_KINDS = new Set<Kind>(["museum", "music", "pub", "club", "comedy", "theatre", "food", "wellness", "talk"]);
export const ADULT_KINDS = new Set<Kind>(["pub", "club"]);

/** Typical visit length by kind, in minutes. */
export const DEFAULT_DURATION: Record<Kind, number> = {
  walk: 90, nature: 90, beach: 90, heritage: 75, museum: 90, music: 120, gig: 150, club: 180, pub: 90,
  comedy: 120, theatre: 150, festival: 120, family: 120, food: 75, market: 60, sport: 120, water: 150,
  wellness: 120, tour: 120, talk: 90, other: 90,
};
