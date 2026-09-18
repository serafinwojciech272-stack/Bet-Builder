import type { BookmakerId, MarketKey, OddsQuote, OddsSnapshot, SportEvent, SportKey } from '../src/domain/types.js';

const PRIORITY_SPORTS = [
  'soccer_epl', 'soccer_uefa_champs_league', 'soccer_uefa_europa_league', 'soccer_uefa_europa_conference_league',
  'soccer_germany_bundesliga', 'soccer_italy_serie_a', 'soccer_spain_la_liga', 'soccer_france_ligue_one',
  'soccer_netherlands_eredivisie', 'soccer_portugal_primeira_liga', 'soccer_belgium_first_div', 'soccer_turkey_super_league',
  'basketball_nba', 'basketball_euroleague', 'basketball_wnba', 'icehockey_nhl', 'baseball_mlb', 'americanfootball_nfl',
  'tennis_atp', 'tennis_wta',
] as const;
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
interface DatasetResponse { events: SportEvent[]; snapshots: OddsSnapshot[]; issues: { code: string; severity: 'info' | 'warning' | 'error'; message: string; reference?: string }[]; droppedRecords: number; normalizedAt: string; provider: 'the-odds-api'; mode: 'LIVE'; requestedDate: string; sportsQueried: string[]; bookmakers: string[]; availableSports: Array<{ key: string; title: string; group: string }>; quota?: { remaining: number | null; used: number | null; lastCost: number | null }; }
interface QueryRequest { method?: string; query?: Record<string, string | string[] | undefined>; }
interface JsonResponse { status: (code: number) => JsonResponse; setHeader: (name: string, value: string) => JsonResponse; end: (body: string) => void; }
function json(res: JsonResponse, status: number, body: unknown) {
  res.status(status)
    .setHeader('Content-Type', 'application/json; charset=utf-8')
    .setHeader('Cache-Control', 's-maxage=45, stale-while-revalidate=30')
    .setHeader('X-BadBuilder-Provider', 'the-odds-api');
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
async function getActiveSports(apiKey: string): Promise<ApiSport[]> { const response = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${encodeURIComponent(apiKey)}`); if (!response.ok) throw new Error(`SPORTS_CATALOG_${response.status}`); return await response.json() as ApiSport[]; }

export default async function handler(req: QueryRequest, res: JsonResponse) {
  if (req.method !== 'GET') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  const apiKey = process.env.THE_ODDS_API_KEY;
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
  catch (e) { issues.push({ code: 'sports-catalog-error', severity: 'warning', message: e instanceof Error ? e.message : 'Could not load sports catalog.' }); }
  const availableSports = catalog.filter((s) => s.active).map((s) => ({ key: s.key, title: s.title, group: s.group }));
  if (requestedSport === 'all') {
    // Prefer the compact upcoming board, then use a small catalog-driven league batch if the provider does not return events.
    sports = ['upcoming'];
  } else {
    const matching = availableSports.filter((s) => s.group.toLowerCase() === requestedSport.toLowerCase() || s.key.toLowerCase() === requestedSport.toLowerCase());
    sports = (matching.length ? matching : [{ key: requestedSport, title: requestedSport, group: requestedSport }]).slice(0, 8).map((s) => s.key);
  }

  const events = new Map<string, SportEvent>(); const snapshots: OddsSnapshot[] = []; let droppedRecords = 0; let lastQuota: DatasetResponse['quota']; const bookmakerNames = new Map<string, string>();
  const now = Date.now();
  for (const sportKey of sports) {
    const url = new URL(`https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sportKey)}/odds/`);
    url.searchParams.set('apiKey', apiKey); url.searchParams.set('regions', regions); url.searchParams.set('markets', markets); url.searchParams.set('oddsFormat', 'decimal'); url.searchParams.set('dateFormat', 'iso'); url.searchParams.set('commenceTimeFrom', from); url.searchParams.set('commenceTimeTo', to);
    const response = await fetch(url);
    const remaining = Number(response.headers.get('x-requests-remaining')); const used = Number(response.headers.get('x-requests-used')); const lastCost = Number(response.headers.get('x-requests-last'));
    lastQuota = { remaining: Number.isFinite(remaining) ? remaining : null, used: Number.isFinite(used) ? used : null, lastCost: Number.isFinite(lastCost) ? lastCost : null };
    if (!response.ok) { const text = await response.text(); issues.push({ code: 'provider-error', severity: 'warning', message: `The Odds API ${response.status} for ${sportKey}: ${text.slice(0, 180)}`, reference: sportKey }); continue; }
    const rawEvents = await response.json() as ApiEvent[];
    for (const raw of rawEvents) {
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
          snapshots.push({ id: `${raw.id}:${bookmaker.key}:${market.key}:${capturedAt}`, eventId: raw.id, market: canonicalMarket, bookmaker: bookmaker.key as BookmakerId, capturedAt, quotes, feedLatencyMs: Math.max(0, now - new Date(capturedAt).getTime()), provider: 'the-odds-api' });
        }
      }
    }
  }
  if (!events.size) issues.push({ code: 'no-events', severity: 'info', message: `No live provider events found for ${requestedDate}.` });
  const body: DatasetResponse = { events: [...events.values()].sort((a, b) => a.startTime.localeCompare(b.startTime)), snapshots: snapshots.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)), issues, droppedRecords, normalizedAt: new Date().toISOString(), provider: 'the-odds-api', mode: 'LIVE', requestedDate, sportsQueried: sports, bookmakers: [...bookmakerNames.values()].sort(), availableSports, quota: lastQuota };
  return json(res, 200, body);
}
