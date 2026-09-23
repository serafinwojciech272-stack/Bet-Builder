import type { BookmakerId, MarketKey, OddsQuote, OddsSnapshot, SportEvent, SportKey } from '../src/domain/types.js';

const MARKET_MAP: Record<string, MarketKey> = {
  h2h: 'match-winner',
  spreads: 'spread',
  totals: 'totals',
  btts: 'both-teams-to-score',
};
interface ApiSport { key: string; group: string; title: string; active: boolean; has_outrights: boolean; }
interface ApiOutcome { name: string; price: number; point?: number; }
interface ApiMarket { key: string; last_update: string; outcomes: ApiOutcome[]; }
interface ApiBookmaker { key: string; title: string; last_update: string; markets: ApiMarket[]; }
interface ApiEvent { id: string; sport_key: string; sport_title: string; commence_time: string; home_team: string; away_team: string; bookmakers: ApiBookmaker[]; }
interface DatasetResponse { events: SportEvent[]; snapshots: OddsSnapshot[]; issues: { code: string; severity: 'info' | 'warning' | 'error'; message: string; reference?: string }[]; droppedRecords: number; normalizedAt: string; provider: 'parlay-api' | 'sportscore'; mode: 'LIVE' | 'LIVE_DATA_NO_ODDS'; requestedDate: string; sportsQueried: string[]; bookmakers: string[]; availableSports: Array<{ key: string; title: string; group: string }>; quota?: { remaining: number | null; used: number | null; lastCost: number | null }; }
interface QueryRequest { method?: string; query?: Record<string, string | string[] | undefined>; headers?: Record<string, string | undefined>; }
let sportsCatalogCache: { apiKey: string; expiresAt: number; value: ApiSport[] } | null = null;
interface JsonResponse { status: (code: number) => JsonResponse; setHeader: (name: string, value: string) => JsonResponse; end: (body: string) => void; }
function json(res: JsonResponse, status: number, body: unknown) {
  res.status(status)
    .setHeader('Content-Type', 'application/json; charset=utf-8')
    .setHeader('Cache-Control', 'no-store')
    .setHeader('X-BadBuilder-Provider', 'multi-provider');
  res.end(JSON.stringify(body));
}
function queryValue(req: QueryRequest, key: string, fallback: string): string { const value = req.query?.[key]; return typeof value === 'string' ? value : fallback; }
function polishDate(iso: string): string { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)); }
function dateBoundsUtc(date: string) {
  // The provider requires second-precision ISO timestamps with a trailing Z.
  // The product date is Warsaw-local, so derive the UTC window from the
  // Europe/Warsaw offset rather than assuming a fixed offset.
  const probe = new Date(`${date}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Warsaw',
    timeZoneName: 'longOffset',
  }).formatToParts(probe);
  const offsetPart = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  const match = offsetPart.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  const sign = match?.[1] === '-' ? -1 : 1;
  const hours = Number(match?.[2] ?? 0);
  const minutes = Number(match?.[3] ?? 0);
  const offsetMs = sign * (hours * 60 + minutes) * 60 * 1000;
  const start = new Date(new Date(`${date}T00:00:00Z`).getTime() - offsetMs);
  const end = new Date(new Date(`${date}T23:59:59Z`).getTime() - offsetMs);
  const isoSeconds = (value: Date) => value.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return { from: isoSeconds(start), to: isoSeconds(end) };
}
function slug(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function team(name: string) { return { id: slug(name), name, shortName: name.length > 18 ? name.slice(0, 18) : name, rating: 0.5, form: [] as Array<'W' | 'D' | 'L'>, injuriesOut: 0 }; }
function canonicalSport(key: string): SportKey { if (key.startsWith('basketball_')) return 'basketball'; if (key.startsWith('icehockey_')) return 'icehockey'; if (key.startsWith('baseball_')) return 'baseball'; if (key.startsWith('americanfootball_')) return 'americanfootball'; if (key.startsWith('tennis_')) return 'tennis'; if (key.startsWith('volleyball_')) return 'volleyball'; if (key.startsWith('golf_')) return 'golf'; if (key.startsWith('handball_')) return 'handball'; if (key.startsWith('rugby')) return 'rugby'; if (key.startsWith('tabletennis_')) return 'tabletennis'; if (key.startsWith('darts_')) return 'darts'; if (key.startsWith('cricket_')) return 'cricket'; if (key.startsWith('aussierules_')) return 'aussierules'; return 'soccer'; }
async function fetchWithTimeout(url: string | URL, init: RequestInit = {}, timeoutMs = 7000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}
async function getActiveSports(apiKey: string): Promise<ApiSport[]> {
  if (sportsCatalogCache && sportsCatalogCache.apiKey === apiKey && sportsCatalogCache.expiresAt > Date.now()) return sportsCatalogCache.value;
  const response = await fetchWithTimeout('https://parlay-api.com/v1/sports/', { headers: { 'X-API-Key': apiKey, Accept: 'application/json' } }, 5000);
  if (!response.ok) throw new Error(`SPORTS_CATALOG_${response.status}`);
  const value = await response.json() as ApiSport[];
  sportsCatalogCache = { apiKey, expiresAt: Date.now() + 5 * 60 * 1000, value };
  return value;
}


async function fetchSportScoreFallback(
  requestedDate: string,
  requestedSport: string,
  issues: DatasetResponse['issues'],
): Promise<{ events: SportEvent[]; availableSports: Array<{ key: string; title: string; group: string }>; queriedSports: string[] }> {
  const sportMap: Record<string, string> = { soccer: 'football', football: 'football', basketball: 'basketball', tennis: 'tennis', cricket: 'cricket' };
  const requested = requestedSport === 'all' ? ['football', 'basketball', 'tennis', 'cricket'] : [sportMap[requestedSport.toLowerCase()] ?? requestedSport.toLowerCase()];
  const uniqueSports = [...new Set(requested)].filter((sport) => ['football', 'basketball', 'tennis', 'cricket'].includes(sport));
  const results = await Promise.all(uniqueSports.map(async (sport) => {
    try {
      const url = new URL('https://sportscore.com/api/widget/matches/');
      url.searchParams.set('sport', sport);
      url.searchParams.set('limit', '50');
      url.searchParams.set('src', 'bet-builder');
      const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 7000);
      if (!response.ok) throw new Error(`SportScore ${response.status}`);
      const payload = await response.json() as {
        sport?: string;
        matches?: Array<{
          home?: string; away?: string; home_score?: number | null; away_score?: number | null;
          status?: string; competition?: string; time?: string; id?: string | number;
        }>;
      };
      return { sport, matches: Array.isArray(payload.matches) ? payload.matches : [] };
    } catch (error) {
      issues.push({ code: 'sportscore-error', severity: 'warning', message: error instanceof Error ? error.message : 'SportScore request failed.', reference: sport });
      return { sport, matches: [] };
    }
  }));

  const events: SportEvent[] = [];
  const labels: Record<string, string> = {
    football: 'Football', basketball: 'Basketball', tennis: 'Tennis', cricket: 'Cricket',
  };
  for (const result of results) {
    for (const match of result.matches) {
      if (!match.home || !match.away || !match.time) continue;
      const startTime = new Date(match.time);
      if (!Number.isFinite(startTime.getTime()) || polishDate(startTime.toISOString()) !== requestedDate) continue;
      const status = String(match.status ?? '').toLowerCase();
      const eventId = `sportscore:${result.sport}:${match.id ?? slug(`${match.home}-${match.away}-${match.time}`)}`;
      events.push({
        id: eventId,
        sportKey: canonicalSport(result.sport),
        league: {
          id: slug(match.competition ?? labels[result.sport]),
          name: match.competition ?? labels[result.sport],
          sportKey: canonicalSport(result.sport),
          country: 'International',
        },
        homeTeam: team(match.home),
        awayTeam: team(match.away),
        startTime: startTime.toISOString(),
        status: status.includes('live') || status === 'in_progress' ? 'live' : status.includes('finished') || status === 'ended' ? 'final' : 'scheduled',
        venue: '',
        monitored: true,
        liquidity: 0.5,
      });
    }
  }
  if (events.length) issues.push({
    code: 'sportscore-fallback',
    severity: 'info',
    message: 'Real match feed supplied by SportScore because the primary odds provider returned no usable events/odds.',
  });
  return {
    events: events.sort((a, b) => a.startTime.localeCompare(b.startTime)),
    queriedSports: uniqueSports,
    availableSports: uniqueSports.map((key) => ({ key: canonicalSport(key), title: labels[key], group: labels[key] })),
  };
}

async function oddsHandler(req: QueryRequest, res: JsonResponse) {
  const origin = req.headers?.origin;
  const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS ?? 'https://bet-builder-preview.vercel.app,https://bet-builder-live.onrender.com').split(',').map((value) => value.trim()).filter(Boolean));
  if (origin && allowedOrigins.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return json(res, 204, '');
  if (req.method !== 'GET') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  const apiKey = process.env.PARLAY_API_KEY?.trim();
  if (!apiKey) return json(res, 503, { error: 'ODDS_PROVIDER_NOT_CONFIGURED' });
  const requestedDate = queryValue(req, 'date', polishDate(new Date().toISOString()));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) return json(res, 400, { error: 'INVALID_DATE', message: 'Use date=YYYY-MM-DD.' });
  const requestedSport = queryValue(req, 'sport', 'all');
  // Provider-safe default: BTTS stays supported by the normalizer but is not requested from the current live endpoint.
  const markets = queryValue(req, 'markets', requestedSport === 'all' ? 'h2h' : 'h2h,spreads,totals');
  const regions = queryValue(req, 'regions', 'eu');
  const { from, to } = dateBoundsUtc(requestedDate);
  const issues: DatasetResponse['issues'] = [];
  let sports: string[];
  let catalog: ApiSport[] = [];
  try { catalog = await getActiveSports(apiKey); }
  catch (e) {
    issues.push({ code: 'sports-catalog-error', severity: 'warning', message: e instanceof Error ? e.message : 'Could not load sports catalog.' });
    catalog = [
      ['soccer_epl','Soccer','EPL'], ['soccer_spain_la_liga','Soccer','La Liga'], ['soccer_germany_bundesliga','Soccer','Bundesliga'],
      ['soccer_italy_serie_a','Soccer','Serie A'], ['soccer_france_ligue_one','Soccer','Ligue 1'], ['soccer_poland_ekstraklasa','Soccer','Ekstraklasa'],
      ['basketball_nba','Basketball','NBA'], ['tennis_atp','Tennis','ATP'], ['baseball_mlb','Baseball','MLB'], ['americanfootball_nfl','American Football','NFL']
    ].map(([key, group, title]) => ({ key, group, title, active: true, has_outrights: false }));
  }
  const availableSports = catalog.filter((s) => s.active).map((s) => ({ key: s.key, title: s.title, group: s.group }));
  if (requestedSport === 'all') {
    // ParlayAPI exposes sport keys through /sports; unlike the legacy feed it has no documented `upcoming` key.
    // Query a bounded cross-sport board to keep refreshes cheap while the full provider catalog remains visible.
    // Prefer major competitions that are likely to have useful scheduled/live markets.
    // The first catalog item for a group can be a seasonal competition (for example
    // FIFA World Cup) with no fixtures today, so selecting by group alone creates
    // avoidable empty/timeout-heavy refreshes.
    const preferredKeys = [
      'soccer_epl',
      'soccer_italy_serie_a',
      'soccer_spain_la_liga',
      'soccer_germany_bundesliga',
      'soccer_poland_ekstraklasa',
      'basketball_nba',
      'icehockey_nhl',
      'tennis_atp',
      'volleyball',
      'baseball_mlb',
      'americanfootball_nfl',
    ];
    const selected: ApiSport[] = [];
    for (const key of preferredKeys) {
      const match = catalog.find((s) => s.active && s.key === key);
      if (match) selected.push(match);
      if (selected.length >= 8) break;
    }
    if (!selected.length) selected.push(...catalog.filter((s) => s.active).slice(0, 8));
    sports = selected.map((s) => s.key);
  } else {
    const matching = availableSports.filter((s) => s.group.toLowerCase() === requestedSport.toLowerCase() || s.key.toLowerCase() === requestedSport.toLowerCase());
    sports = (matching.length ? matching : [{ key: requestedSport, title: requestedSport, group: requestedSport }]).slice(0, 8).map((s) => s.key);
  }

  const successfulSports: string[] = []; const failedSports: string[] = [];
  const events = new Map<string, SportEvent>(); const snapshots: OddsSnapshot[] = []; let droppedRecords = 0; let lastQuota: DatasetResponse['quota']; const bookmakerNames = new Map<string, string>();
  const now = Date.now();
  const STALE_AFTER_MS = 10 * 60 * 1000;
  // Fetch sports concurrently instead of serially. The old sequential loop could turn a normal
  // refresh into a 30–60s wait when one provider call was slow.
  const results = await Promise.all(sports.map(async (sportKey) => {
    const url = new URL(`https://parlay-api.com/v1/sports/${encodeURIComponent(sportKey)}/odds/`);
    url.searchParams.set('regions', regions); url.searchParams.set('markets', markets); url.searchParams.set('oddsFormat', 'decimal'); url.searchParams.set('dateFormat', 'iso'); url.searchParams.set('commenceTimeFrom', from); url.searchParams.set('commenceTimeTo', to);
    try {
      const response = await fetchWithTimeout(url, { headers: { 'X-API-Key': apiKey, Accept: 'application/json' } }, 5500);
      const remaining = Number(response.headers.get('x-requests-remaining')); const used = Number(response.headers.get('x-requests-used')); const lastCost = Number(response.headers.get('x-requests-last'));
      const quota = { remaining: Number.isFinite(remaining) ? remaining : null, used: Number.isFinite(used) ? used : null, lastCost: Number.isFinite(lastCost) ? lastCost : null };
      if (!response.ok) return { sportKey, error: `ParlayAPI ${response.status}: ${(await response.text()).slice(0, 180)}`, quota };
      return { sportKey, rawEvents: await response.json() as ApiEvent[], quota };
    } catch (error) {
      return { sportKey, error: error instanceof Error ? error.name === 'AbortError' ? 'request timeout after 5.5s' : error.message : 'request failed', quota: null };
    }
  }));
  for (const result of results) {
    if (result.quota) lastQuota = result.quota;
    if ('error' in result) {
      failedSports.push(result.sportKey);
      issues.push({ code: result.error.includes('timeout') ? 'provider-timeout' : 'provider-error', severity: 'warning', message: `${result.error} for ${result.sportKey}`, reference: result.sportKey });
      continue;
    }
    successfulSports.push(result.sportKey);
    for (const raw of result.rawEvents) {
      if (polishDate(raw.commence_time) !== requestedDate) continue;
      const sport = canonicalSport(raw.sport_key);
      const eventStart = new Date(raw.commence_time).getTime();
      events.set(raw.id, { id: raw.id, sportKey: sport, league: { id: slug(raw.sport_key), name: raw.sport_title, sportKey: sport, country: 'International' }, homeTeam: team(raw.home_team), awayTeam: team(raw.away_team), startTime: raw.commence_time, status: eventStart <= now ? 'live' : 'scheduled', venue: '', monitored: true, liquidity: 0.8 });
      for (const bookmaker of raw.bookmakers ?? []) {
        bookmakerNames.set(bookmaker.key, bookmaker.title);
        for (const market of bookmaker.markets ?? []) {
          const canonicalMarket = MARKET_MAP[market.key]; if (!canonicalMarket) continue;
          const quotes: OddsQuote[] = market.outcomes.filter((o) => Number.isFinite(o.price) && o.price >= 1.01 && o.price <= 1000).map((o) => ({ selectionId: `${raw.id}:${market.key}:${slug(o.name)}${o.point === undefined ? '' : `:${o.point}`}`, label: o.point === undefined ? o.name : `${o.name} ${o.point > 0 ? '+' : ''}${o.point}`, decimalOdds: Number(o.price.toFixed(3)) }));
          if (!quotes.length) { droppedRecords += 1; continue; }
          const capturedAt = market.last_update || bookmaker.last_update;
          snapshots.push({ id: `${raw.id}:${bookmaker.key}:${market.key}:${capturedAt}`, eventId: raw.id, market: canonicalMarket, bookmaker: bookmaker.key as BookmakerId, capturedAt, quotes, feedLatencyMs: Math.max(0, now - new Date(capturedAt).getTime()), provider: 'parlay-api' });
        }
      }
    }
  }
  // A single abandoned/finished market must not mark the entire provider stale.
  // Health is based on the freshest successfully normalized quote.
  const freshestFeedLatencyMs = snapshots.length ? snapshots.reduce((min, snapshot) => Math.min(min, snapshot.feedLatencyMs), Number.POSITIVE_INFINITY) : 0;
  const ageSeconds = Math.floor(freshestFeedLatencyMs / 1000);
  if (snapshots.length && freshestFeedLatencyMs > STALE_AFTER_MS) issues.push({ code: 'stale-odds', severity: 'warning', message: `Latest normalized odds feed is stale by approximately ${ageSeconds}s.` });
  if (!events.size) issues.push({ code: 'no-events', severity: 'info', message: `No live provider events found for ${requestedDate}.` });

  if (!events.size) {
    const fallback = await fetchSportScoreFallback(requestedDate, requestedSport, issues);
    for (const event of fallback.events) events.set(event.id, event);
    if (fallback.events.length) {
      const body: DatasetResponse & { providerHealth: import('../src/domain/types.js').ProviderHealth } = {
        events: fallback.events,
        snapshots: [],
        issues,
        droppedRecords,
        normalizedAt: new Date().toISOString(),
        provider: 'sportscore',
        mode: 'LIVE_DATA_NO_ODDS',
        requestedDate,
        sportsQueried: fallback.queriedSports,
        bookmakers: [],
        availableSports: fallback.availableSports,
        quota: lastQuota,
        providerHealth: {
          provider: 'sportscore',
          state: 'HEALTHY',
          fetchedAt: new Date().toISOString(),
          ageSeconds: 0,
          staleAfterSeconds: 600,
          catalogCount: fallback.availableSports.length,
          queriedSports: fallback.queriedSports.length,
          successfulSports: fallback.availableSports.length,
          failedSports: 0,
          eventCount: fallback.events.length,
          snapshotCount: 0,
          bookmakerCount: 0,
          warnings: ['REAL EVENTS AVAILABLE', 'ODDS NOT AVAILABLE FROM SPORTCORE FALLBACK'],
        },
      };
      return json(res, 200, body);
    }
  }

  const body: DatasetResponse & { providerHealth: import('../src/domain/types.js').ProviderHealth } = { events: [...events.values()].sort((a, b) => a.startTime.localeCompare(b.startTime)), snapshots: snapshots.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)), issues, droppedRecords, normalizedAt: new Date().toISOString(), provider: 'parlay-api', mode: 'LIVE', requestedDate, sportsQueried: sports, bookmakers: [...bookmakerNames.values()].sort(), availableSports, quota: lastQuota, providerHealth: { provider: 'parlay-api', state: failedSports.length ? (successfulSports.length ? 'DEGRADED' : 'OFFLINE') : (snapshots.length && freshestFeedLatencyMs > STALE_AFTER_MS ? 'STALE' : 'HEALTHY'), fetchedAt: new Date().toISOString(), ageSeconds, staleAfterSeconds: 600, catalogCount: availableSports.length, queriedSports: sports.length, successfulSports: successfulSports.length, failedSports: failedSports.length, eventCount: events.size, snapshotCount: snapshots.length, bookmakerCount: bookmakerNames.size, warnings: issues.filter((i) => i.severity !== 'info').map((i) => i.message).slice(0, 6) } };
  return json(res, 200, body);
}


export default async function handler(req: QueryRequest, res: JsonResponse) {
  try {
    return await oddsHandler(req, res);
  } catch {
    return json(res, 500, { error: 'ODDS_INTERNAL_ERROR' });
  }
}
