/**
 * Holds the Free time dataset in memory: loads the committed snapshot at start-up (so it
 * works offline), then refreshes from the live sources once a day when allowed.
 */
import { existsSync, readFileSync } from "node:fs";
import { buildDataset, SOURCE_INFO } from "./ingest.js";
import { deck, plan, type DeckCard, type PlanRequest, type PlanResult } from "./planner.js";
import { fetchForecast } from "./sources/metEireann.js";
import type { Town } from "./towns.js";
import type { Dataset, Forecast, SourceStatus } from "./types.js";

export interface FreeTimeOptions {
  snapshotPath?: string;
  /** Fetch live data (daily) and forecasts. Off in tests. */
  live?: boolean;
  ticketmasterKey?: string;
  /** Inject a forecast function (tests). */
  forecast?: (lat: number, lng: number) => Promise<Forecast>;
}

const EMPTY: Dataset = { generatedAt: new Date(0).toISOString(), sources: [], places: [], events: [] };

export class FreeTimeService {
  private data: Dataset = EMPTY;
  private forecasts = new Map<string, { at: number; value: Forecast | null; error?: string }>();
  private refreshing: Promise<void> | null = null;
  private metStatus: SourceStatus = { ...SOURCE_INFO["met-eireann"], ok: false, count: 0, updatedAt: null };

  constructor(private readonly opts: FreeTimeOptions = {}) {
    if (opts.snapshotPath && existsSync(opts.snapshotPath)) {
      this.data = JSON.parse(readFileSync(opts.snapshotPath, "utf8")) as Dataset;
    }
  }

  /** Replace the dataset (tests). */
  load(data: Dataset) {
    this.data = data;
  }

  get dataset(): Dataset {
    return this.data;
  }

  status(): { generatedAt: string; sources: SourceStatus[] } {
    return { generatedAt: this.data.generatedAt, sources: [...this.data.sources, this.metStatus] };
  }

  /** Refresh from live sources; keeps the old data for any source that fails. */
  refresh(): Promise<void> {
    if (!this.opts.live) return Promise.resolve();
    this.refreshing ??= (async () => {
      try {
        const fresh = await buildDataset({ ticketmasterKey: this.opts.ticketmasterKey });
        const kept = (id: SourceStatus["id"]) => fresh.sources.find((s) => s.id === id)?.ok;
        const places = [
          ...fresh.places,
          ...this.data.places.filter((p) => !kept(p.source)),
        ];
        const events = [...fresh.events, ...this.data.events.filter((e) => !kept(e.source))];
        const sources = fresh.sources.map((s) => (s.ok ? s : (this.data.sources.find((o) => o.id === s.id && o.ok) ?? s)));
        this.data = { generatedAt: fresh.generatedAt, sources, places, events };
        console.log(`[free time] refreshed: ${sources.map((s) => `${s.id} ${s.ok ? s.count : "failed"}`).join(", ")}`);
      } catch (e) {
        console.error("[free time] refresh failed:", (e as Error).message);
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  private async forecastFor(town: Town): Promise<Forecast | null> {
    const get = this.opts.forecast ?? (this.opts.live ? fetchForecast : null);
    if (!get) return null;
    const cached = this.forecasts.get(town.id);
    if (cached && Date.now() - cached.at < 60 * 60 * 1000) return cached.value;
    try {
      const value = await get(town.lat, town.lng);
      this.forecasts.set(town.id, { at: Date.now(), value });
      this.metStatus = { ...this.metStatus, ok: true, count: value.hours.length, updatedAt: value.fetchedAt, error: undefined };
      return value;
    } catch (e) {
      // Remember the failure briefly so a slow or blocked forecast doesn't delay every plan.
      this.forecasts.set(town.id, { at: Date.now() - 50 * 60 * 1000, value: null });
      this.metStatus = { ...this.metStatus, ok: false, error: (e as Error).message };
      return null;
    }
  }

  deck(req: PlanRequest, town: Town, seen: Set<string>): DeckCard[] {
    return deck(req, town, this.data.places, this.data.events, seen);
  }

  async plan(req: PlanRequest, town: Town): Promise<PlanResult> {
    const forecast = await this.forecastFor(town);
    return plan(req, town, this.data.places, this.data.events, forecast);
  }
}
