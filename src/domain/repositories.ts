import type { NormalizationIssue, OddsSnapshot, SportEvent } from './types';
import { RAW_EVENTS, RAW_ODDS } from './feed/rawFeed';
import { normalizeEvents, normalizeOddsSnapshots } from './feed/normalization';

export interface CanonicalDataset {
  events: SportEvent[];
  snapshots: OddsSnapshot[];
  issues: NormalizationIssue[];
  droppedRecords: number;
  normalizedAt: string;
  provider?: 'demo' | 'the-odds-api';
  mode?: 'DEMO' | 'LIVE';
  requestedDate?: string;
  sportsQueried?: string[];
  bookmakers?: string[];
  quota?: { remaining: number | null; used: number | null; lastCost: number | null };
}

export interface SportsDataRepository {
  loadCanonicalDataset(options?: { date?: string; sport?: string; forceRefresh?: boolean }): Promise<CanonicalDataset>;
  getEvent(eventId: string): Promise<SportEvent | null>;
  getSnapshots(eventId: string): Promise<OddsSnapshot[]>;
}

function delay(ms: number) { return new Promise<void>((resolve) => setTimeout(resolve, ms)); }

/** Legacy deterministic repository retained for tests and explicit demo tooling. */
export class MockSportsDataRepository implements SportsDataRepository {
  private cache: CanonicalDataset | null = null;
  private attempts = 0;
  constructor(private readonly options: { latencyMs?: number; failFirstLoad?: boolean } = {}) {}
  async loadCanonicalDataset(): Promise<CanonicalDataset> {
    if (this.cache) return this.cache;
    await delay(this.options.latencyMs ?? 520);
    this.attempts += 1;
    if (this.options.failFirstLoad && this.attempts === 1) throw new Error('FEED_UNAVAILABLE: provider gateway timed out (retry available)');
    const eventResult = normalizeEvents(RAW_EVENTS);
    const ids = new Set(eventResult.value.map((e) => e.id));
    const oddsResult = normalizeOddsSnapshots(RAW_ODDS, ids);
    this.cache = { events: eventResult.value, snapshots: oddsResult.value, issues: [...eventResult.issues, ...oddsResult.issues], droppedRecords: eventResult.droppedRecords + oddsResult.droppedRecords, normalizedAt: new Date().toISOString(), provider: 'demo', mode: 'DEMO' };
    return this.cache;
  }
  async getEvent(eventId: string): Promise<SportEvent | null> { const data = await this.loadCanonicalDataset(); return data.events.find((e) => e.id === eventId) ?? null; }
  async getSnapshots(eventId: string): Promise<OddsSnapshot[]> { const data = await this.loadCanonicalDataset(); return data.snapshots.filter((s) => s.eventId === eventId); }
}

/** Production browser repository. Secrets stay server-side in /api/odds. */
export class LiveSportsDataRepository implements SportsDataRepository {
  private cache = new Map<string, CanonicalDataset>();

  async loadCanonicalDataset(options: { date?: string; sport?: string; forceRefresh?: boolean } = {}): Promise<CanonicalDataset> {
    const date = options.date ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const sport = options.sport ?? 'all';
    const cacheKey = `${date}:${sport}`;
    if (!options.forceRefresh && this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;
    const response = await fetch(`/api/odds?date=${encodeURIComponent(date)}&sport=${encodeURIComponent(sport)}`);
    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try { const body = await response.json() as { error?: string; message?: string }; detail = body.message ?? body.error ?? detail; } catch { /* keep HTTP status */ }
      throw new Error(`LIVE_ODDS_UNAVAILABLE: ${detail}`);
    }
    const data = await response.json() as CanonicalDataset;
    const normalized: CanonicalDataset = { ...data, provider: 'the-odds-api', mode: 'LIVE', requestedDate: date };
    this.cache.set(cacheKey, normalized);
    return normalized;
  }
  async getEvent(eventId: string): Promise<SportEvent | null> { const data = await this.loadCanonicalDataset(); return data.events.find((e) => e.id === eventId) ?? null; }
  async getSnapshots(eventId: string): Promise<OddsSnapshot[]> { const data = await this.loadCanonicalDataset(); return data.snapshots.filter((s) => s.eventId === eventId); }
}

export const sportsDataRepository: SportsDataRepository = new MockSportsDataRepository({ latencyMs: 460 });
