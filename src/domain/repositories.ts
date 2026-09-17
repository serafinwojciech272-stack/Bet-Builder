import type { NormalizationIssue, OddsSnapshot, SportEvent } from './types';
import { RAW_EVENTS, RAW_ODDS } from './feed/rawFeed';
import { normalizeEvents, normalizeOddsSnapshots } from './feed/normalization';

export interface CanonicalDataset {
  events: SportEvent[];
  snapshots: OddsSnapshot[];
  issues: NormalizationIssue[];
  droppedRecords: number;
  normalizedAt: string;
}

export interface SportsDataRepository {
  loadCanonicalDataset(): Promise<CanonicalDataset>;
  getEvent(eventId: string): Promise<SportEvent | null>;
  getSnapshots(eventId: string): Promise<OddsSnapshot[]>;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Stage 1–3 in-memory implementation. Swappable for a real provider client. */
export class MockSportsDataRepository implements SportsDataRepository {
  private cache: CanonicalDataset | null = null;
  private attempts = 0;

  constructor(private readonly options: { latencyMs?: number; failFirstLoad?: boolean } = {}) {}

  async loadCanonicalDataset(): Promise<CanonicalDataset> {
    // Cached dataset resolves immediately; only a cold pull pays feed latency.
    if (this.cache) return this.cache;
    await delay(this.options.latencyMs ?? 520);
    this.attempts += 1;
    if (this.options.failFirstLoad && this.attempts === 1) {
      throw new Error('FEED_UNAVAILABLE: provider gateway timed out (retry available)');
    }

    const eventResult = normalizeEvents(RAW_EVENTS);
    const ids = new Set(eventResult.value.map((e) => e.id));
    const oddsResult = normalizeOddsSnapshots(RAW_ODDS, ids);

    this.cache = {
      events: eventResult.value,
      snapshots: oddsResult.value,
      issues: [...eventResult.issues, ...oddsResult.issues],
      droppedRecords: eventResult.droppedRecords + oddsResult.droppedRecords,
      normalizedAt: new Date().toISOString(),
    };
    return this.cache;
  }

  async getEvent(eventId: string): Promise<SportEvent | null> {
    const data = await this.loadCanonicalDataset();
    return data.events.find((e) => e.id === eventId) ?? null;
  }

  async getSnapshots(eventId: string): Promise<OddsSnapshot[]> {
    const data = await this.loadCanonicalDataset();
    return data.snapshots.filter((s) => s.eventId === eventId);
  }
}

export const sportsDataRepository: SportsDataRepository = new MockSportsDataRepository({
  latencyMs: 460,
});
