import { randomBytes, randomUUID } from "node:crypto";

export const newId = () => randomUUID();
export const newToken = (bytes = 24) => randomBytes(bytes).toString("base64url");

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function shortCode(length = 6): string {
  const bytes = randomBytes(length);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function slugify(s: string): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 20) || "me"
  );
}

/** Today's date as YYYY-MM-DD in UTC. */
export const todayIso = (now = new Date()) => now.toISOString().slice(0, 10);

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
