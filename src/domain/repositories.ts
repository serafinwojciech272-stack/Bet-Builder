import type { NormalizationIssue, OddsSnapshot, SportEvent, ProviderHealth } from './types';
import { RAW_EVENTS, RAW_ODDS } from './feed/rawFeed';
import { normalizeEvents, normalizeOddsSnapshots } from './feed/normalization';

export interface CanonicalDataset {
  events: SportEvent[];
  snapshots: OddsSnapshot[];
  issues: NormalizationIssue[];
  droppedRecords: number;
  normalizedAt: string;
  provider?: 'demo' | 'parlay-api' | 'the-odds-api' | 'sportscore';
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
function sportScoreKey(sport: string): import('./types').SportKey {
  if (sport === 'basketball') return 'basketball';
  if (sport === 'tennis') return 'tennis';
  if (sport === 'cricket') return 'cricket';
  return 'soccer';
}
function sportScoreSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
async function loadSportScoreDirect(date: string, sport: string): Promise<CanonicalDataset> {
  const sports = sport === 'all' ? ['football', 'basketball', 'tennis', 'cricket'] : [sport === 'soccer' ? 'football' : sport];
  const events: SportEvent[] = [];
  const issues: NormalizationIssue[] = [];
  for (const currentSport of sports) {
    if (!['football', 'basketball', 'tennis', 'cricket'].includes(currentSport)) continue;
    const url = new URL('https://sportscore.com/api/widget/matches/');
    url.searchParams.set('sport', currentSport);
    url.searchParams.set('limit', '50');
    url.searchParams.set('src', 'bet-builder-live');
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`SPORTSCORE_BROWSER_HTTP_${response.status}`);
    const payload = await response.json() as { matches?: Array<Record<string, unknown>> };
    for (const match of payload.matches ?? []) {
      const home = String(match.home ?? match.home_team ?? match.homeTeam ?? '').trim();
      const away = String(match.away ?? match.away_team ?? match.awayTeam ?? '').trim();
      const rawTime = String(match.time ?? match.start_time ?? match.startTime ?? match.commence_time ?? '').trim();
      const start = new Date(rawTime);
      if (!home || !away || !Number.isFinite(start.getTime())) continue;
      const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(start);
      if (localDate !== date) continue;
      const competition = String(match.competition ?? match.league ?? match.tournament ?? currentSport).trim();
      const statusText = String(match.status ?? match.state ?? '').toLowerCase();
      const status = statusText.includes('live') || statusText.includes('progress') ? 'live' : statusText.includes('finish') || statusText.includes('ended') ? 'final' : 'scheduled';
      events.push({
        id: `sportscore:${currentSport}:${String(match.id ?? match.match_id ?? sportScoreSlug(home + '-' + away + '-' + rawTime))}`,
        sportKey: sportScoreKey(currentSport),
        league: { id: sportScoreSlug(competition), name: competition, sportKey: sportScoreKey(currentSport), country: 'International' },
        homeTeam: { id: sportScoreSlug(home), name: home, shortName: home.slice(0, 18), rating: 0.5, form: [], injuriesOut: 0 },
        awayTeam: { id: sportScoreSlug(away), name: away, shortName: away.slice(0, 18), rating: 0.5, form: [], injuriesOut: 0 },
        startTime: start.toISOString(),
        status,
        venue: '',
        monitored: true,
        liquidity: 0.5,
      });
    }
  }
  if (!events.length) issues.push({ code: 'sportscore-browser-empty', severity: 'info', message: `SportScore returned no usable events for ${date}.` });
  return {
    events: events.sort((a, b) => a.startTime.localeCompare(b.startTime)),
    snapshots: [],
    issues,
    droppedRecords: 0,
    normalizedAt: new Date().toISOString(),
    provider: 'sportscore',
    mode: 'LIVE_DATA_NO_ODDS',
    requestedDate: date,
    sportsQueried: sports,
    bookmakers: [],
    availableSports: sports.filter(s => ['football','basketball','tennis','cricket'].includes(s)).map(s => ({ key: sportScoreKey(s), title: s, group: s })),
    providerHealth: {
      provider: 'sportscore',
      state: events.length ? 'HEALTHY' : 'OFFLINE',
      fetchedAt: new Date().toISOString(),
      ageSeconds: 0,
      staleAfterSeconds: 600,
      catalogCount: sports.length,
      queriedSports: sports.length,
      successfulSports: sports.length,
      failedSports: 0,
      eventCount: events.length,
      snapshotCount: 0,
      bookmakerCount: 0,
      warnings: ['REAL EVENTS AVAILABLE', 'NO BOOKMAKER ODDS'],
    },
  };
}

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
        if (response.status >= 500 || response.status === 403 || response.status === 429 || response.status === 404) {
          try {
            const direct = await loadSportScoreDirect(date, sport);
            if (direct.events.length) {
              this.cache.set(cacheKey, direct);
              return direct;
            }
          } catch { /* Backend provider remains the authoritative path when browser fallback is unavailable. */ }
        }
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
