import type { NormalizationIssue, OddsSnapshot, SportEvent, ProviderHealth, OddsQuote } from './types';
import { RAW_EVENTS, RAW_ODDS } from './feed/rawFeed';
import { normalizeEvents, normalizeOddsSnapshots } from './feed/normalization';

export interface CanonicalDataset {
  events: SportEvent[];
  snapshots: OddsSnapshot[];
  issues: NormalizationIssue[];
  droppedRecords: number;
  normalizedAt: string;
  provider?: 'demo' | 'parlay-api' | 'the-odds-api' | 'sportscore' | 'thesportsdb' | 'odds-api.io' | 'arbiscan';
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
function sportScoreSlug(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function bookmakerKey(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 32) || 'unknown'; }
function normalizeDecimalOdds(price: number): number | null {
  if (!Number.isFinite(price)) return null;
  if (price >= 100) return Number((1 + price / 100).toFixed(3));
  if (price <= -100) return Number((1 + 100 / Math.abs(price)).toFixed(3));
  if (price >= 1.01 && price <= 100) return Number(price.toFixed(3));
  return null;
}
function canonicalSportFromKey(key: string): import('./types').SportKey {
  if (key.startsWith('basketball_')) return 'basketball';
  if (key.startsWith('americanfootball_')) return 'americanfootball';
  if (key.startsWith('icehockey_')) return 'icehockey';
  if (key.startsWith('baseball_')) return 'baseball';
  if (key.startsWith('tennis_')) return 'tennis';
  if (key.startsWith('volleyball_')) return 'volleyball';
  return 'soccer';
}
function liveStatus(raw: Record<string, unknown>, start: Date): 'live' | 'final' | 'scheduled' {
  const text = String(raw.status ?? raw.state ?? '').toLowerCase();
  if (Boolean(raw.completed) || ['final', 'finished', 'ended'].includes(text)) return 'final';
  if (Boolean(raw.live) || ['live', 'inplay', 'in-play', 'in progress'].includes(text)) return 'live';
  return start.getTime() <= Date.now() && start.getTime() > Date.now() - 4 * 60 * 60 * 1000 ? 'live' : 'scheduled';
}

async function loadParlayTryDirect(date: string, sport: string): Promise<CanonicalDataset> {
  const sportKeys = sport === 'all'
    ? ['soccer_epl', 'basketball_nba', 'americanfootball_nfl', 'icehockey_nhl', 'baseball_mlb', 'mma_mixed_martial_arts']
    : [sport === 'soccer' ? 'soccer_epl' : sport === 'basketball' ? 'basketball_nba' : sport];
  const events: SportEvent[] = [];
  const snapshots: OddsSnapshot[] = [];
  const bookmakers = new Map<string, string>();
  const issues: NormalizationIssue[] = [{ code: 'api-gateway-recovery', severity: 'warning', message: 'Primary /api/odds response was unavailable or invalid. Browser recovered against the no-auth ParlayAPI live feed.' }];
  await Promise.all(sportKeys.map(async (sportKey) => {
    try {
      const response = await fetch(`https://parlay-api.com/v1/try/${encodeURIComponent(sportKey)}/odds?oddsFormat=decimal`, { headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const payload = await response.json() as { events?: Array<Record<string, unknown>> };
      for (const raw of payload.events ?? []) {
        const home = String(raw.home_team ?? raw.home ?? '').trim();
        const away = String(raw.away_team ?? raw.away ?? '').trim();
        const rawTime = String(raw.commence_time ?? raw.start_time ?? raw.time ?? '').trim();
        const start = new Date(rawTime);
        if (!raw.id || !home || !away || !Number.isFinite(start.getTime())) continue;
        const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(start);
        if (localDate !== date) continue;
        const canonicalSport = canonicalSportFromKey(String(raw.sport_key ?? sportKey));
        const id = `parlay-browser:${String(raw.id)}`;
        events.push({
          id, sportKey: canonicalSport,
          league: { id: sportScoreSlug(String(raw.sport_key ?? sportKey)), name: String(raw.sport_title ?? sportKey), sportKey: canonicalSport, country: 'International' },
          homeTeam: { id: sportScoreSlug(home), name: home, shortName: home.slice(0, 18), rating: 0.5, form: [], injuriesOut: 0 },
          awayTeam: { id: sportScoreSlug(away), name: away, shortName: away.slice(0, 18), rating: 0.5, form: [], injuriesOut: 0 },
          startTime: start.toISOString(), status: liveStatus(raw, start), venue: '', monitored: true, liquidity: 0.8,
        });
        for (const rawBook of Array.isArray(raw.bookmakers) ? raw.bookmakers as Array<Record<string, unknown>> : []) {
          const name = String(rawBook.title ?? rawBook.key ?? 'Bookmaker');
          const key = bookmakerKey(String(rawBook.key ?? name));
          bookmakers.set(key, name);
          for (const rawMarket of Array.isArray(rawBook.markets) ? rawBook.markets as Array<Record<string, unknown>> : []) {
            const marketKey = String(rawMarket.key ?? '');
            if (marketKey !== 'h2h') continue;
            const outcomes = Array.isArray(rawMarket.outcomes) ? rawMarket.outcomes as Array<Record<string, unknown>> : [];
            const quotes: OddsQuote[] = outcomes.map((o): OddsQuote | null => { const label = String(o.name ?? ''); const decimalOdds = normalizeDecimalOdds(Number(o.price)); if (!label || decimalOdds === null) return null; return { label, decimalOdds, selectionId: `${id}:${key}:${sportScoreSlug(label)}` }; }).filter((q): q is OddsQuote => q !== null);
            if (!quotes.length) continue;
            const capturedAt = String(rawMarket.last_update ?? rawBook.last_update ?? new Date().toISOString());
            snapshots.push({ id: `${id}:${key}:${capturedAt}`, eventId: id, market: 'match-winner', bookmaker: key as import('./types').BookmakerId, capturedAt, quotes, feedLatencyMs: Math.max(0, Date.now() - new Date(capturedAt).getTime()), provider: 'parlay-api-try' });
          }
        }
      }
    } catch { /* Continue other sport feeds. */ }
  }));
  const uniqueEvents = [...new Map(events.map(e => [e.id, e])).values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
  return {
    events: uniqueEvents, snapshots, issues, droppedRecords: 0, normalizedAt: new Date().toISOString(), provider: 'parlay-api', mode: snapshots.length ? 'LIVE' : 'LIVE_DATA_NO_ODDS', requestedDate: date,
    sportsQueried: sportKeys, bookmakers: [...bookmakers.values()].sort(), availableSports: sportKeys.map(key => ({ key: canonicalSportFromKey(key), title: key, group: key.split('_')[0] })),
    providerHealth: { provider: 'parlay-api', state: uniqueEvents.length ? 'DEGRADED' : 'OFFLINE', fetchedAt: new Date().toISOString(), ageSeconds: 0, staleAfterSeconds: 120, catalogCount: sportKeys.length, queriedSports: sportKeys.length, successfulSports: sportKeys.length, failedSports: 0, eventCount: uniqueEvents.length, snapshotCount: snapshots.length, bookmakerCount: bookmakers.size, warnings: ['PRIMARY API GATEWAY RECOVERED', snapshots.length ? 'REAL LIVE ODDS' : 'REAL EVENTS AVAILABLE', 'NO-AUTH FALLBACK'] },
  };
}

function sportScoreKeyLegacy(sport: string): import('./types').SportKey { return sportScoreKey(sport); }
async function loadSportScoreDirect(date: string, sport: string): Promise<CanonicalDataset> {
  const sports = sport === 'all' ? ['football', 'basketball', 'tennis', 'cricket'] : [sport === 'soccer' ? 'football' : sport];
  const events: SportEvent[] = []; const issues: NormalizationIssue[] = [];
  for (const currentSport of sports) {
    if (!['football', 'basketball', 'tennis', 'cricket'].includes(currentSport)) continue;
    const url = new URL('https://sportscore.com/api/widget/matches/'); url.searchParams.set('sport', currentSport); url.searchParams.set('limit', '50'); url.searchParams.set('src', 'bet-builder-live');
    const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } }); if (!response.ok) throw new Error(`SPORTSCORE_BROWSER_HTTP_${response.status}`);
    const payload = await response.json() as { matches?: Array<Record<string, unknown>> };
    for (const match of payload.matches ?? []) {
      const home = String(match.home ?? match.home_team ?? match.homeTeam ?? '').trim(); const away = String(match.away ?? match.away_team ?? match.awayTeam ?? '').trim(); const rawTime = String(match.time ?? match.start_time ?? match.startTime ?? match.commence_time ?? '').trim(); const start = new Date(rawTime); if (!home || !away || !Number.isFinite(start.getTime())) continue;
      const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(start); if (localDate !== date) continue;
      const competition = String(match.competition ?? match.league ?? match.tournament ?? currentSport).trim(); const statusText = String(match.status ?? match.state ?? '').toLowerCase(); const status = statusText.includes('live') || statusText.includes('progress') ? 'live' : statusText.includes('finish') || statusText.includes('ended') ? 'final' : 'scheduled';
      events.push({ id: `sportscore:${currentSport}:${String(match.id ?? match.match_id ?? sportScoreSlug(home + '-' + away + '-' + rawTime))}`, sportKey: sportScoreKeyLegacy(currentSport), league: { id: sportScoreSlug(competition), name: competition, sportKey: sportScoreKeyLegacy(currentSport), country: 'International' }, homeTeam: { id: sportScoreSlug(home), name: home, shortName: home.slice(0, 18), rating: 0.5, form: [], injuriesOut: 0 }, awayTeam: { id: sportScoreSlug(away), name: away, shortName: away.slice(0, 18), rating: 0.5, form: [], injuriesOut: 0 }, startTime: start.toISOString(), status, venue: '', monitored: true, liquidity: 0.5 });
    }
  }
  if (!events.length) issues.push({ code: 'sportscore-browser-empty', severity: 'info', message: `SportScore returned no usable events for ${date}.` });
  return { events: events.sort((a, b) => a.startTime.localeCompare(b.startTime)), snapshots: [], issues, droppedRecords: 0, normalizedAt: new Date().toISOString(), provider: 'sportscore', mode: 'LIVE_DATA_NO_ODDS', requestedDate: date, sportsQueried: sports, bookmakers: [], availableSports: sports.filter(s => ['football','basketball','tennis','cricket'].includes(s)).map(s => ({ key: sportScoreKeyLegacy(s), title: s, group: s })), providerHealth: { provider: 'sportscore', state: events.length ? 'HEALTHY' : 'OFFLINE', fetchedAt: new Date().toISOString(), ageSeconds: 0, staleAfterSeconds: 600, catalogCount: sports.length, queriedSports: sports.length, successfulSports: sports.length, failedSports: 0, eventCount: events.length, snapshotCount: 0, bookmakerCount: 0, warnings: ['REAL EVENTS AVAILABLE', 'NO BOOKMAKER ODDS'] } };
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

  async loadCanonicalDataset(options: { date?: string; sport?: string; forceRefresh?: boolean } = {}): Promise<CanonicalDataset> {
    const date = options.date ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const sport = options.sport ?? 'all';
    const cacheKey = `${date}:${sport}`;
    if (!options.forceRefresh && this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;

    try {
      const configuredBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '');
      const endpoint = configuredBase ? `${configuredBase}/api/odds` : '/api/odds';
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 9000);
      let response: Response;
      try {
        response = await fetch(`${endpoint}?date=${encodeURIComponent(date)}&sport=${encodeURIComponent(sport)}`, { signal: controller.signal, headers: { Accept: 'application/json' } });
      } finally {
        window.clearTimeout(timeout);
      }
      if (!response.ok) throw new Error(`LIVE_ODDS_HTTP_${response.status}`);

      const text = await response.text();
      let data: CanonicalDataset;
      try {
        data = JSON.parse(text) as CanonicalDataset;
      } catch {
        const recovered = await loadParlayTryDirect(date, sport);
        if (recovered.events.length) { this.cache.set(cacheKey, recovered); return recovered; }
        throw new Error('LIVE_ODDS_INVALID_JSON');
      }
      if (!Array.isArray(data.events) || !Array.isArray(data.snapshots)) {
        const recovered = await loadParlayTryDirect(date, sport);
        if (recovered.events.length) { this.cache.set(cacheKey, recovered); return recovered; }
        throw new Error('LIVE_ODDS_INVALID_PAYLOAD');
      }
      if (!data.events.length) {
        const recovered = await loadParlayTryDirect(date, sport);
        if (recovered.events.length) { this.cache.set(cacheKey, recovered); return recovered; }
        throw new Error('LIVE_ODDS_EMPTY');
      }

      const normalized: CanonicalDataset = {
        ...data,
        provider: data.provider === 'sportscore' || data.provider === 'thesportsdb' ? data.provider : 'parlay-api',
        mode: data.mode === 'LIVE_DATA_NO_ODDS' ? 'LIVE_DATA_NO_ODDS' : 'LIVE',
        requestedDate: date,
      };
      normalized.providerHealth = data.providerHealth ?? deriveProviderHealth(normalized);
      this.cache.set(cacheKey, normalized);
      return normalized;
    } catch (error) {
      try {
        const recovered = await loadParlayTryDirect(date, sport);
        if (recovered.events.length) {
          this.cache.set(cacheKey, recovered);
          return recovered;
        }
      } catch { /* Continue to the next real-data recovery path. */ }

      try {
        const sportScore = await loadSportScoreDirect(date, sport);
        if (sportScore.events.length) {
          this.cache.set(cacheKey, sportScore);
          return sportScore;
        }
      } catch { /* No deterministic fallback. Live data failure must remain visible. */ }

      const detail = error instanceof Error ? error.message : 'Unknown provider failure';
      throw new Error(`LIVE_DATA_UNAVAILABLE: ${detail}`);
    }
  }

  async getEvent(eventId: string) { const data = await this.loadCanonicalDataset(); return data.events.find(e => e.id === eventId) ?? null; }
  async getSnapshots(eventId: string) { const data = await this.loadCanonicalDataset(); return data.snapshots.filter(s => s.eventId === eventId); }
}

export const sportsDataRepository: SportsDataRepository = new LiveSportsDataRepository();
