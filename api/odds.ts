import type { BookmakerId, MarketKey, OddsQuote, OddsSnapshot, SportEvent, SportKey } from '../src/domain/types';

const SOCCER_SPORTS = [
  'soccer_epl',
  'soccer_uefa_champs_league',
  'soccer_uefa_europa_league',
  'soccer_uefa_europa_conference_league',
  'soccer_germany_bundesliga',
  'soccer_italy_serie_a',
  'soccer_spain_la_liga',
  'soccer_france_ligue_one',
] as const;

const SPORT_MAP: Record<string, SportKey> = Object.fromEntries(
  SOCCER_SPORTS.map((key) => [key, 'soccer']),
) as Record<string, SportKey>;

const MARKET_MAP: Record<string, MarketKey> = {
  h2h: 'match-winner',
  spreads: 'spread',
  totals: 'totals',
};

interface ApiOutcome {
  name: string;
  price: number;
  point?: number;
}

interface ApiMarket {
  key: string;
  last_update: string;
  outcomes: ApiOutcome[];
}

interface ApiBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: ApiMarket[];
}

interface ApiEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: ApiBookmaker[];
}

interface DatasetResponse {
  events: SportEvent[];
  snapshots: OddsSnapshot[];
  issues: { code: string; severity: 'info' | 'warning' | 'error'; message: string; reference?: string }[];
  droppedRecords: number;
  normalizedAt: string;
  provider: 'the-odds-api';
  mode: 'LIVE';
  requestedDate: string;
}

function json(res: any, status: number, body: unknown) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function polishDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

function dateBoundsUtc(date: string) {
  const start = new Date(`${date}T00:00:00Z`);
  const end = new Date(`${date}T23:59:59Z`);
  return {
    from: new Date(start.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    to: new Date(end.getTime() + 2 * 60 * 60 * 1000).toISOString(),
  };
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function team(name: string) {
  return {
    id: slug(name),
    name,
    shortName: name.length > 18 ? name.slice(0, 18) : name,
    rating: 0.5,
    form: [] as Array<'W' | 'D' | 'L'>,
    injuriesOut: 0,
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });

  const apiKey = process.env.THE_ODDS_API_KEY;
  if (!apiKey) return json(res, 503, { error: 'ODDS_PROVIDER_NOT_CONFIGURED' });

  const requestedDate = String(req.query?.date ?? polishDate(new Date().toISOString()));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    return json(res, 400, { error: 'INVALID_DATE', message: 'Use date=YYYY-MM-DD.' });
  }

  const sport = String(req.query?.sport ?? 'soccer');
  const sports = sport === 'soccer' ? SOCCER_SPORTS : [sport];
  const markets = String(req.query?.markets ?? 'h2h,spreads,totals');
  const regions = String(req.query?.regions ?? 'eu');
  const { from, to } = dateBoundsUtc(requestedDate);
  const events = new Map<string, SportEvent>();
  const snapshots: OddsSnapshot[] = [];
  const issues: DatasetResponse['issues'] = [];
  let droppedRecords = 0;

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
    if (!response.ok) {
      const text = await response.text();
      issues.push({
        code: 'provider-error',
        severity: 'warning',
        message: `The Odds API ${response.status} for ${sportKey}: ${text.slice(0, 180)}`,
        reference: sportKey,
      });
      continue;
    }

    const rawEvents = (await response.json()) as ApiEvent[];
    for (const raw of rawEvents) {
      if (polishDate(raw.commence_time) !== requestedDate) continue;
      const canonicalSport = SPORT_MAP[raw.sport_key] ?? 'soccer';
      const event: SportEvent = {
        id: raw.id,
        sportKey: canonicalSport,
        league: {
          id: slug(raw.sport_key),
          name: raw.sport_title,
          sportKey: canonicalSport,
          country: 'International',
        },
        homeTeam: team(raw.home_team),
        awayTeam: team(raw.away_team),
        startTime: raw.commence_time,
        status: 'scheduled',
        venue: '',
        monitored: true,
        liquidity: 0.8,
      };
      events.set(raw.id, event);

      for (const bookmaker of raw.bookmakers ?? []) {
        for (const market of bookmaker.markets ?? []) {
          const canonicalMarket = MARKET_MAP[market.key];
          if (!canonicalMarket) continue;
          const quotes: OddsQuote[] = market.outcomes
            .filter((o) => Number.isFinite(o.price) && o.price >= 1.01 && o.price <= 1000)
            .map((o) => ({
              selectionId: `${raw.id}:${market.key}:${slug(o.name)}${o.point === undefined ? '' : `:${o.point}`}`,
              label: o.point === undefined ? o.name : `${o.name} ${o.point > 0 ? '+' : ''}${o.point}`,
              decimalOdds: Number(o.price.toFixed(3)),
            }));
          if (!quotes.length) {
            droppedRecords += 1;
            continue;
          }
          snapshots.push({
            id: `${raw.id}:${bookmaker.key}:${market.key}:${market.last_update}`,
            eventId: raw.id,
            market: canonicalMarket,
            bookmaker: bookmaker.key as BookmakerId,
            capturedAt: market.last_update,
            quotes,
            feedLatencyMs: 0,
            provider: 'the-odds-api',
          });
        }
      }
    }
  }

  if (!events.size) {
    issues.push({
      code: 'no-events',
      severity: 'info',
      message: `No live provider events found for ${requestedDate}.`,
    });
  }

  const body: DatasetResponse = {
    events: [...events.values()],
    snapshots: snapshots.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)),
    issues,
    droppedRecords,
    normalizedAt: new Date().toISOString(),
    provider: 'the-odds-api',
    mode: 'LIVE',
    requestedDate,
  };
  return json(res, 200, body);
}
