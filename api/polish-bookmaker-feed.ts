import type { CanonicalDataset } from '../src/domain/repositories.js';
import type { BookmakerId, OddsQuote, OddsSnapshot, SportEvent, SportKey } from '../src/domain/types.js';

type BookmakerName = 'STS' | 'Superbet';

type ExternalEvent = {
  id: number | string;
  home: string;
  away: string;
  date: string;
  sport?: { name?: string; slug?: string };
  league?: { name?: string; slug?: string };
  bookmakers?: Record<string, Array<{
    name?: string;
    updatedAt?: string;
    odds?: Array<Record<string, unknown>>;
  }>>;
};

const BOOKMAKER_ALIASES: Record<BookmakerName, string[]> = {
  STS: ['STS PL', 'STS'],
  Superbet: ['Superbet'],
};

const SPORTS: Array<{ api: string; canonical: SportKey }> = [
  { api: 'football', canonical: 'soccer' },
  { api: 'basketball', canonical: 'basketball' },
  { api: 'tennis', canonical: 'tennis' },
  { api: 'ice-hockey', canonical: 'icehockey' },
  { api: 'baseball', canonical: 'baseball' },
  { api: 'handball', canonical: 'handball' },
];

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function polishDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
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

function canonicalMarket(name: string): 'match-winner' | 'spread' | 'totals' | 'both-teams-to-score' | null {
  const value = name.toLowerCase();
  if (value === 'ml' || value.includes('moneyline')) return 'match-winner';
  if (value === 'spread' || value.includes('handicap')) return 'spread';
  if (value === 'totals' || value.includes('total')) return 'totals';
  if (value === 'btts' || value.includes('both teams')) return 'both-teams-to-score';
  return null;
}

function decimal(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 1.01 && n <= 100 ? Number(n.toFixed(3)) : null;
}

function quote(eventId: string, market: string, label: string, odds: unknown, point?: unknown): OddsQuote | null {
  const price = decimal(odds);
  if (price === null) return null;
  const pointNumber = point === undefined || point === null ? undefined : Number(point);
  const suffix = Number.isFinite(pointNumber) ? `:${pointNumber}` : '';
  return {
    selectionId: `${eventId}:${slug(market)}:${slug(label)}${suffix}`,
    label: Number.isFinite(pointNumber) ? `${label} ${pointNumber! > 0 ? '+' : ''}${pointNumber}` : label,
    decimalOdds: price,
  };
}

function extractQuotes(eventId: string, marketName: string, rows: Array<Record<string, unknown>>): OddsQuote[] {
  const out: OddsQuote[] = [];
  for (const row of rows) {
    const push = (label: string, value: unknown, point?: unknown) => {
      const item = quote(eventId, marketName, label, value, point);
      if (item) out.push(item);
    };
    const lower = marketName.toLowerCase();
    if (lower === 'ml' || lower.includes('moneyline')) {
      push('Home', row.home); push('Draw', row.draw); push('Away', row.away);
    } else if (lower === 'spread' || lower.includes('handicap')) {
      push('Home', row.home, row.hdp); push('Away', row.away, row.hdp);
    } else if (lower === 'totals' || lower.includes('total')) {
      push('Over', row.over, row.hdp); push('Under', row.under, row.hdp);
    } else if (lower === 'btts' || lower.includes('both teams')) {
      push('Yes', row.yes); push('No', row.no);
    }
  }
  return out;
}

function findBookmaker(record: Record<string, Array<{ name?: string; updatedAt?: string; odds?: Array<Record<string, unknown>> }>>, requested: BookmakerName) {
  const aliases = BOOKMAKER_ALIASES[requested];
  const key = Object.keys(record).find((candidate) => aliases.some(alias => candidate.toLowerCase() === alias.toLowerCase()));
  return key ? { key, markets: record[key] ?? [] } : null;
}

async function fetchJson(url: URL, apiKey: string): Promise<Response> {
  return fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  }).then(response => {
    if (!response.ok) throw new Error(`ODDS_API_IO_${response.status}`);
    return response;
  });
}

export async function fetchPolishBookmakerDataset(
  requestedDate: string,
  requestedSport: string,
  requestedBookmakers: string[],
): Promise<CanonicalDataset & { provider: string; mode: 'LIVE' | 'LIVE_DATA_NO_ODDS'; requestedDate: string; sportsQueried: string[]; bookmakers: string[]; providerHealth?: CanonicalDataset['providerHealth'] }> {
  const apiKey = process.env.ODDS_API_IO_KEY?.trim();
  const wanted = requestedBookmakers.filter(value => ['STS', 'Superbet'].includes(value)) as BookmakerName[];
  const base = {
    events: [] as SportEvent[],
    snapshots: [] as OddsSnapshot[],
    issues: [] as CanonicalDataset['issues'],
    droppedRecords: 0,
    normalizedAt: new Date().toISOString(),
  };

  if (!apiKey || !wanted.length) {
    return {
      ...base,
      provider: 'odds-api.io',
      mode: 'LIVE_DATA_NO_ODDS',
      requestedDate,
      sportsQueried: [],
      bookmakers: [],
      providerHealth: {
        provider: 'odds-api.io',
        state: 'OFFLINE',
        fetchedAt: new Date().toISOString(),
        ageSeconds: 0,
        staleAfterSeconds: 300,
        catalogCount: 0,
        queriedSports: 0,
        successfulSports: 0,
        failedSports: 0,
        eventCount: 0,
        snapshotCount: 0,
        bookmakerCount: 0,
        warnings: [apiKey ? 'NO_SUPPORTED_BOOKMAKER_REQUESTED' : 'ODDS_API_IO_KEY_MISSING'],
      },
    };
  }

  const sports = requestedSport === 'all'
    ? SPORTS
    : SPORTS.filter(item => item.canonical === requestedSport || item.api === requestedSport);
  const eventMap = new Map<string, SportEvent>();
  const snapshots: OddsSnapshot[] = [];
  const foundBooks = new Set<string>();
  const issues = [...base.issues];
  let successfulSports = 0;
  let failedSports = 0;
  let stale = false;

  for (const sport of sports) {
    try {
      const eventsUrl = new URL('https://api.odds-api.io/v3/events');
      eventsUrl.searchParams.set('apiKey', apiKey);
      eventsUrl.searchParams.set('sport', sport.api);
      eventsUrl.searchParams.set('status', 'pending');
      eventsUrl.searchParams.set('limit', '1000');
      const response = await fetchJson(eventsUrl, apiKey);
      const events = await response.json() as ExternalEvent[];
      successfulSports += 1;
      const selected = events.filter(event => event.home && event.away && event.date && polishDate(event.date) === requestedDate);
      if (!selected.length) continue;

      const eventIds = selected.map(event => String(event.id)).slice(0, 100);
      const oddsUrl = new URL('https://api.odds-api.io/v3/odds/multi');
      oddsUrl.searchParams.set('apiKey', apiKey);
      oddsUrl.searchParams.set('eventIds', eventIds.join(','));
      oddsUrl.searchParams.set('bookmakers', wanted.join(','));
      const oddsResponse = await fetchJson(oddsUrl, apiKey);
      const oddsEvents = await oddsResponse.json() as ExternalEvent[];

      for (const raw of oddsEvents) {
        if (!raw.id || !raw.home || !raw.away || !raw.date || polishDate(raw.date) !== requestedDate) continue;
        const eventId = `oddsapiio:${raw.id}`;
        const sportKey = sport.canonical;
        eventMap.set(eventId, {
          id: eventId,
          sportKey,
          league: {
            id: slug(raw.league?.slug ?? raw.league?.name ?? sport.api),
            name: raw.league?.name ?? sport.api,
            sportKey,
            country: 'International',
          },
          homeTeam: team(raw.home),
          awayTeam: team(raw.away),
          startTime: raw.date,
          status: 'scheduled',
          venue: '',
          monitored: true,
          liquidity: 0.8,
        });

        for (const requestedBookmaker of wanted) {
          const bookmaker = findBookmaker(raw.bookmakers ?? {}, requestedBookmaker);
          if (!bookmaker) continue;
          foundBooks.add(requestedBookmaker);
          for (const market of bookmaker.markets) {
            const marketKey = canonicalMarket(market.name ?? '');
            if (!marketKey || !Array.isArray(market.odds)) continue;
            const quotes = extractQuotes(eventId, market.name ?? '', market.odds);
            if (!quotes.length) continue;
            const capturedAt = market.updatedAt ?? new Date().toISOString();
            const ageSeconds = Math.max(0, (Date.now() - new Date(capturedAt).getTime()) / 1000);
            if (ageSeconds > 300) stale = true;
            snapshots.push({
              id: `${eventId}:${requestedBookmaker}:${slug(market.name ?? '')}:${capturedAt}`,
              eventId,
              market: marketKey,
              bookmaker: requestedBookmaker.toLowerCase() as BookmakerId,
              capturedAt,
              quotes,
              feedLatencyMs: Math.round(ageSeconds * 1000),
              provider: 'odds-api.io',
            });
          }
        }
      }
    } catch (error) {
      failedSports += 1;
      issues.push({
        code: 'odds-api-io-error',
        severity: 'warning',
        message: `${error instanceof Error ? error.message : 'request failed'} for ${sport.api}`,
        reference: sport.api,
      });
    }
  }

  const providerHealth = {
    provider: 'odds-api.io',
    state: failedSports && snapshots.length ? 'DEGRADED' as const : failedSports ? 'OFFLINE' as const : stale ? 'STALE' as const : snapshots.length ? 'HEALTHY' as const : 'DEGRADED' as const,
    fetchedAt: new Date().toISOString(),
    ageSeconds: snapshots.length ? Math.round(Math.min(...snapshots.map(s => s.feedLatencyMs)) / 1000) : 0,
    staleAfterSeconds: 300,
    catalogCount: sports.length,
    queriedSports: sports.length,
    successfulSports,
    failedSports,
    eventCount: eventMap.size,
    snapshotCount: snapshots.length,
    bookmakerCount: foundBooks.size,
    warnings: issues.filter(issue => issue.severity !== 'info').map(issue => issue.message).slice(0, 8),
  };

  if (!snapshots.length) issues.push({
    code: 'requested-bookmaker-odds-missing',
    severity: 'warning',
    message: `No live ${wanted.join(' + ')} bookmaker odds were returned for ${requestedDate}.`,
  });

  return {
    ...base,
    events: [...eventMap.values()].sort((a, b) => a.startTime.localeCompare(b.startTime)),
    snapshots,
    issues,
    provider: 'odds-api.io',
    mode: snapshots.length ? 'LIVE' : 'LIVE_DATA_NO_ODDS',
    requestedDate,
    sportsQueried: sports.map(item => item.api),
    bookmakers: [...foundBooks],
    providerHealth,
  };
}
