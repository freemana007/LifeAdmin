/** Shared shapes for the Free time planner. Used by the server and the phone demo. */

export const KINDS = [
  "walk", "nature", "beach", "heritage", "museum", "music", "gig", "club", "pub", "comedy", "theatre",
  "festival", "family", "food", "market", "sport", "water", "wellness", "tour", "talk", "other",
] as const;
export type Kind = (typeof KINDS)[number];

export type SourceId = "failte-attractions" | "failte-events" | "sport-ireland-trails" | "ticketmaster";

export interface Place {
  id: string;
  source: SourceId;
  name: string;
  kind: Kind;
  county: string;
  lat: number;
  lng: number;
  indoor: boolean;
  /** Typical time spent there, in minutes. */
  durationMin: number;
  /** Price per person when known; null when the source doesn't say. */
  price: number | null;
  free: boolean;
  kidFriendly: boolean;
  /** Pubs, clubs and late gigs. */
  adultsOnly: boolean;
  url: string | null;
  summary: string;
  /** Walks: distance and difficulty. */
  lengthKm?: number;
  difficulty?: string;
  dogs?: boolean | null;
  /** True when only part of a long trail fits in a few hours. */
  section?: boolean;
}

export interface FtEvent extends Place {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  /** HH:MM when the source gives one. */
  startTime: string | null;
  venue: string | null;
  /** The event runs on several dates within the range (exact days not listed). */
  recurring: boolean;
}

export interface SourceStatus {
  id: SourceId | "met-eireann";
  name: string;
  licence: string;
  credit: string;
  url: string;
  ok: boolean;
  count: number;
  updatedAt: string | null;
  error?: string;
}

export interface Dataset {
  generatedAt: string;
  sources: SourceStatus[];
  places: Place[];
  events: FtEvent[];
}

export interface ForecastHour {
  time: string; // ISO
  tempC: number | null;
  rainMm: number;
}

export interface Forecast {
  hours: ForecastHour[];
  fetchedAt: string;
}
