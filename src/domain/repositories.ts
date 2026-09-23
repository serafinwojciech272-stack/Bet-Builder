import type { NormalizationIssue, OddsSnapshot, SportEvent, ProviderHealth } from './types';
import { RAW_EVENTS, RAW_ODDS } from './feed/rawFeed';
import { normalizeEvents, normalizeOddsSnapshots } from './feed/normalization';

export interface CanonicalDataset {
  events: SportEvent[];
  snapshots: OddsSnapshot[];
  issues: NormalizationIssue[];
  droppedRecords: number;
  normalizedAt: string;
  provider?: 'demo' | 'parlay-api' | 'sportscore';
  mode?: 'DEMO' | 'LIVE' | 'LIVE_DATA_NO_ODDS';
  requestedDate?: string;
  sportsQueried?: string[];
  bookmakers?: string[];
  quota?: { remaining: number | null; used: number | null; lastCost: number | null };
  availableSports?: Array<{ key: string; title: string; group: string }>;
  providerHealth?: ProviderHealth;
}
export interface SportsDataRepository {
  loadCanonicalDataset(options?: { date?: string; sport?: string; forceRefresh?: boolean }): Promise<CanonicalDataset>;
  getEvent(eventId: string): Promise<SportEvent | null>;
  getSnapshots(eventId: string): Promise<OddsSnapshot[]>;
}
function delay(ms: number) { return new Promise<void>(resolve => setTimeout(resolve, ms)); }
function deriveProviderHealth(data: CanonicalDataset): ProviderHealth {
  const fetchedAt = data.normalizedAt;
  const ageSeconds = Math.max(0, Math.round((Date.now() - new Date(fetchedAt).getTime()) / 1000));
  const staleAfterSeconds = 600;
  const queriedSports = data.sportsQueried?.length ?? 0;
  const failedSports = data.issues.filter(i => i.code === 'provider-error' || i.code === 'provider-network-error' || i.code === 'provider-payload-error').length;
  return { provider: data.provider ?? 'unknown', state: data.mode !== 'LIVE' ? 'OFFLINE' : ageSeconds > staleAfterSeconds ? 'STALE' : failedSports > 0 ? 'DEGRADED' : 'HEALTHY', fetchedAt, ageSeconds, staleAfterSeconds, catalogCount: data.availableSports?.length ?? 0, queriedSports, successfulSports: Math.max(0, queriedSports - failedSports), failedSports, eventCount: data.events.length, snapshotCount: data.snapshots.length, bookmakerCount: data.bookmakers?.length ?? new Set(data.snapshots.map(s => s.bookmaker)).size, warnings: data.issues.filter(i => i.severity !== 'info').map(i => i.message).slice(0, 6) };
}
export class MockSportsDataRepository implements SportsDataRepository {
  private cache: CanonicalDataset | null = null;
  constructor(private readonly options: { latencyMs?: number; failFirstLoad?: boolean } = {}) {}
  async loadCanonicalDataset(): Promise<CanonicalDataset> {
    if (this.cache) return this.cache;
    await delay(this.options.latencyMs ?? 520);
    const eventResult = normalizeEvents(RAW_EVENTS);
    const ids = new Set(eventResult.value.map(e => e.id));
    const oddsResult = normalizeOddsSnapshots(RAW_ODDS, ids);
    this.cache = { events: eventResult.value, snapshots: oddsResult.value, issues: [...eventResult.issues, ...oddsResult.issues], droppedRecords: eventResult.droppedRecords + oddsResult.droppedRecords, normalizedAt: new Date().toISOString(), provider: 'demo', mode: 'DEMO' };
    return this.cache;
  }
  async getEvent(eventId: string) { const data = await this.loadCanonicalDataset(); return data.events.find(e => e.id === eventId) ?? null; }
  async getSnapshots(eventId: string) { const data = await this.loadCanonicalDataset(); return data.snapshots.filter(s => s.eventId === eventId); }
}
export class LiveSportsDataRepository implements SportsDataRepository {
  private cache = new Map<string, CanonicalDataset>();
  private readonly testFallback = import.meta.env.MODE === 'test';
  private readonly testRepository = new MockSportsDataRepository({ latencyMs: 0 });

  async loadCanonicalDataset(options: { date?: string; sport?: string; forceRefresh?: boolean } = {}): Promise<CanonicalDataset> {
    const date = options.date ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const sport = options.sport ?? 'all';
    const cacheKey = `${date}:${sport}`;
    if (this.testFallback) return this.testRepository.loadCanonicalDataset();
    if (!options.forceRefresh && this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;

    try {
      const configuredBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '');
      // Same-origin is the canonical deployment path. A split Render/API deployment
      // remains supported through VITE_API_BASE_URL.
      const endpoint = configuredBase ? `${configuredBase}/api/odds` : '/api/odds';
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 9000);
      let response: Response;
      try {
        response = await fetch(`${endpoint}?date=${encodeURIComponent(date)}&sport=${encodeURIComponent(sport)}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
      } finally {
        window.clearTimeout(timeout);
      }

      if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try {
          const body = await response.json() as { error?: string; message?: string };
          detail = body.message ?? body.error ?? detail;
        } catch { /* Keep HTTP status when provider response is not JSON. */ }
        throw new Error(`LIVE_ODDS_UNAVAILABLE: ${detail}`);
      }

      const data = await response.json() as CanonicalDataset;
      if (!Array.isArray(data.events) || !Array.isArray(data.snapshots)) throw new Error('LIVE_ODDS_INVALID_PAYLOAD');

      // Do not silently present deterministic fixtures as live data.
      if (!data.events.length) {
        const fallback = await this.testRepository.loadCanonicalDataset();
        const providerIssues = data.issues ?? [];
        const degraded = {
          ...fallback,
          normalizedAt: new Date().toISOString(),
          requestedDate: date,
          provider: 'demo' as const,
          mode: 'DEMO' as const,
          availableSports: data.availableSports,
          quota: data.quota,
          issues: [
            { code: 'live-provider-empty', severity: 'warning' as const, message: providerIssues[0]?.message ?? 'Live providers returned no events.' },
            ...providerIssues,
            ...fallback.issues,
          ],
        };
        this.cache.set(cacheKey, degraded);
        return degraded;
      }

      const normalized: CanonicalDataset = {
        ...data,
        provider: data.provider === 'sportscore' ? 'sportscore' : 'parlay-api',
        mode: data.mode === 'LIVE_DATA_NO_ODDS' ? 'LIVE_DATA_NO_ODDS' : 'LIVE',
        requestedDate: date,
      };
      normalized.providerHealth = data.providerHealth ?? deriveProviderHealth(normalized);
      this.cache.set(cacheKey, normalized);
      return normalized;
    } catch (error) {
      const fallback = await this.testRepository.loadCanonicalDataset();
      const detail = error instanceof Error ? error.message : 'Unknown provider failure';
      const degraded = {
        ...fallback,
        normalizedAt: new Date().toISOString(),
        requestedDate: date,
        provider: 'demo' as const,
        mode: 'DEMO' as const,
        availableSports: undefined,
        quota: undefined,
        issues: [
          { code: 'live-provider-fallback', severity: 'warning' as const, message: `Live odds unavailable (${detail}). Showing deterministic fallback data.` },
          ...fallback.issues,
        ],
      };
      this.cache.set(cacheKey, degraded);
      return degraded;
    }
  }

  async getEvent(eventId: string) { const data = await this.loadCanonicalDataset(); return data.events.find(e => e.id === eventId) ?? null; }
  async getSnapshots(eventId: string) { const data = await this.loadCanonicalDataset(); return data.snapshots.filter(s => s.eventId === eventId); }
}
export const sportsDataRepository: SportsDataRepository = new LiveSportsDataRepository();
