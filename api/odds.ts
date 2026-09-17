import type { BookmakerId, MarketKey, OddsQuote, OddsSnapshot, SportEvent, SportKey } from '../src/domain/types';

const PRIORITY_SPORTS = [
  'soccer_epl',
  'soccer_uefa_champs_league',
  'soccer_uefa_europa_league',
  'soccer_uefa_europa_conference_league',
  'soccer_germany_bundesliga',
  'soccer_italy_serie_a',
  'soccer_spain_la_liga',
  'soccer_france_ligue_one',
  'soccer_netherlands_eredivisie',
  'soccer_portugal_primeira_liga',
  'soccer_belgium_first_div',
  'soccer_turkey_super_league',
  'basketball_nba',
  'basketball_euroleague',
  'basketball_wnba',
  'icehockey_nhl',
  'baseball_mlb',
  'americanfootball_nfl',
  'tennis_atp',
  'tennis_wta',
] as const;

const MARKET_MAP: Record<string, MarketKey> = {
  h2h: 'match-winner',
  spreads: 'spread',
  totals: 'totals',
};

interface ApiSport { key: string; group: string; title: string; active: boolean; has_outrights: boolean; }
interface ApiOutcome { name: string; price: number; point?: number; }
interface ApiMarket { key: string; last_update: string; outcomes: ApiOutcome[]; }
interface ApiBookmaker { key: string; title: string; last_update: string; markets: ApiMarket[]; }
interface ApiEvent { id: string; sport_key: string; sport_title: string; commence_time: string; home_team: string; away_team: string; bookmakers: ApiBookmaker[]; }
interface DatasetResponse {
  events: SportEvent[];
  snapshots: OddsSnapshot[];
  issues: { code: string; severity: 'info' | 'warning' | 'error'; message: string; reference?: string }[];
  droppedRecords: number;
  normalizedAt: string;
  provider: 'the-odds-api';
  mode: 'LIVE';
  requestedDate: string;
  sportsQueried: string[];
  bookmakers: string[];
  quota?: { remaining: number | null; used: number | null; lastCost: number | null };
}

function json(res: any, status: number, body: unknown) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function polishDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

function dateBoundsUtc(date: string) {
  const start = new Date(`${date}T00:00:00Z`);
  const end = new Date(`${date}T23:59:59Z`);
  return {
    from: new Date(start.getTime() - 3 * 60 * 60 * 1000).toISOString(),
    to: new Date(end.getTime() + 3 * 60 * 60 * 1000).toISOString(),
  };
}

function slug(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

function team(name: string) {
  return { id: slug(name), name, shortName: name.length > 18 ? name.slice(0, 18) : name, rating: 0.5, form: [] as Array<'W' | 'D' | 'L'>, injuriesOut: 0 };
}

function canonicalSport(key: string): SportKey {
  if (key.startsWith('basketball_')) return 'basketball';
  if (key.startsWith('icehockey_')) return 'icehockey';
  if (key.startsWith('baseball_')) return 'baseball';
  if (key.startsWith('americanfootball_')) return 'americanfootball';
  return 'soccer';
}

async function getActiveSports(apiKey: string): Promise<ApiSport[]> {
  const response = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${encodeURIComponent(apiKey)}`);
  if (!response.ok) throw new Error(`SPORTS_CATALOG_${response.status}`);
  return await response.json() as ApiSport[];
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  const apiKey = process.env.THE_ODDS_API_KEY;
  if (!apiKey) return json(res, 503, { error: 'ODDS_PROVIDER_NOT_CONFIGURED' });

  const requestedDate = String(req.query?.date ?? polishDate(new Date().toISOString()));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) return json(res, 400, { error: 'INVALID_DATE', message: 'Use date=YYYY-MM-DD.' });

  const requestedSport = String(req.query?.sport ?? 'all');
  const markets = String(req.query?.markets ?? 'h2h,spreads,totals');
  const regions = String(req.query?.regions ?? 'eu');
  const { from, to } = dateBoundsUtc(requestedDate);
  const issues: DatasetResponse['issues'] = [];
  let sports: string[];

  if (requestedSport === 'all') {
    try {
      const catalog = await getActiveSports(apiKey);
      const active = new Set(catalog.filter((s) => s.active && !s.has_outrights).map((s) => s.key));
      sports = PRIORITY_SPORTS.filter((key) => active.has(key)).slice(0, 14);
      if (!sports.length) sports = ['soccer_epl'];
    } catch (e) {
      issues.push({ code: 'sports-catalog-error', severity: 'warning', message: e instanceof Error ? e.message : 'Could not load sports catalog.' });
      sports = ['soccer_epl', 'soccer_uefa_champs_league', 'soccer_italy_serie_a', 'soccer_spain_la_liga', 'basketball_nba', 'icehockey_nhl', 'baseball_mlb', 'americanfootball_nfl'];
    }
  } else {
    sports = [requestedSport];
  }

  const events = new Map<string, SportEvent>();
  const snapshots: OddsSnapshot[] = [];
  let droppedRecords = 0;
  let lastQuota: DatasetResponse['quota'];
  const bookmakerNames = new Map<string, string>();

  for (const sportKey of sports) {
    const url = new URL(`https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sportKey)}/odds/`);
    url.searchParams.set('apiKey', apiKey);
    url.searchParams.set('regions', regions);
    url.searchParams.set('markets', markets);
    url.searchParams.set('oddsFormat', 'decimal');
    url.searchParams.set('dateFormat', 'iso');
    url.searchParams.set('commenceTimeFrom', from);
    url.searchParams.set('commenceTimeTo', to);

    const response = await fetch(url);
    const remaining = Number(response.headers.get('x-requests-remaining'));
    const used = Number(response.headers.get('x-requests-used'));
    const lastCost = Number(response.headers.get('x-requests-last'));
    lastQuota = {
      remaining: Number.isFinite(remaining) ? remaining : null,
      used: Number.isFinite(used) ? used : null,
      lastCost: Number.isFinite(lastCost) ? lastCost : null,
    };

    if (!response.ok) {
      const text = await response.text();
      issues.push({ code: 'provider-error', severity: 'warning', message: `The Odds API ${response.status} for ${sportKey}: ${text.slice(0, 180)}`, reference: sportKey });
      continue;
    }

    const rawEvents = await response.json() as ApiEvent[];
    for (const raw of rawEvents) {
      if (polishDate(raw.commence_time) !== requestedDate) continue;
      const sport = canonicalSport(raw.sport_key);
      events.set(raw.id, {
        id: raw.id,
        sportKey: sport,
        league: { id: slug(raw.sport_key), name: raw.sport_title, sportKey: sport, country: 'International' },
        homeTeam: team(raw.home_team),
        awayTeam: team(raw.away_team),
        startTime: raw.commence_time,
        status: 'scheduled',
        venue: '',
        monitored: true,
        liquidity: 0.8,
      });

      for (const bookmaker of raw.bookmakers ?? []) {
        bookmakerNames.set(bookmaker.key, bookmaker.title);
        for (const market of bookmaker.markets ?? []) {
          const canonicalMarket = MARKET_MAP[market.key];
          if (!canonicalMarket) continue;
          const quotes: OddsQuote[] = market.outcomes
            .filter((o) => Number.isFinite(o.price) && o.price >= 1.01 && o.price <= 1000)
            .map((o) => ({ selectionId: `${raw.id}:${market.key}:${slug(o.name)}${o.point === undefined ? '' : `:${o.point}`}`, label: o.point === undefined ? o.name : `${o.name} ${o.point > 0 ? '+' : ''}${o.point}`, decimalOdds: Number(o.price.toFixed(3)) }));
          if (!quotes.length) { droppedRecords += 1; continue; }
          snapshots.push({ id: `${raw.id}:${bookmaker.key}:${market.key}:${market.last_update}`, eventId: raw.id, market: canonicalMarket, bookmaker: bookmaker.key as BookmakerId, capturedAt: market.last_update, quotes, feedLatencyMs: 0, provider: 'the-odds-api' });
        }
      }
    }
  }

  if (!events.size) issues.push({ code: 'no-events', severity: 'info', message: `No live provider events found for ${requestedDate}.` });
  const body: DatasetResponse = {
    events: [...events.values()].sort((a, b) => a.startTime.localeCompare(b.startTime)),
    snapshots: snapshots.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)),
    issues,
    droppedRecords,
    normalizedAt: new Date().toISOString(),
    provider: 'the-odds-api',
    mode: 'LIVE',
    requestedDate,
    sportsQueried: sports,
    bookmakers: [...bookmakerNames.values()].sort(),
    quota: lastQuota,
  };
  return json(res, 200, body);
}
