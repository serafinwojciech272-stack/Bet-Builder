import type {
  Bookmaker,
  BookmakerId,
  EventStatus,
  League,
  MarketKey,
  NormalizationIssue,
  NormalizationResult,
  OddsQuote,
  OddsSnapshot,
  SportEvent,
  SportKey,
  Team,
} from '../types';
import type { RawOddsRecord, RawProviderEvent, RawTeam } from './rawFeed';

export const BOOKMAKERS: Record<BookmakerId, Bookmaker> = {
  openbook: { id: 'openbook', name: 'OpenBook', weight: 1 },
  betfair: { id: 'betfair', name: 'Betfair', weight: 0.95 },
  northline: { id: 'northline', name: 'Northline', weight: 0.82 },
  apex: { id: 'apex', name: 'Apex', weight: 0.78 },
  meridian: { id: 'meridian', name: 'Meridian', weight: 0.74 },
};

const SPORT_MAP: Record<string, SportKey> = {
  SOCCER: 'soccer',
  BASKET: 'basketball',
  AMERICAN_FOOTBALL: 'americanfootball',
  ICE_HOCKEY: 'icehockey',
  BASEBALL: 'baseball',
  TENNIS: 'tennis',
  VOLLEYBALL: 'volleyball',
  GOLF: 'golf',
  HANDBALL: 'handball',
  RUGBY: 'rugby',
  TABLE_TENNIS: 'tabletennis',
  DARTS: 'darts',
  CRICKET: 'cricket',
  AUSSIE_RULES: 'aussierules',
};

const MARKET_MAP: Record<string, MarketKey> = {
  '1X2': 'match-winner',
  ML: 'moneyline',
  OU: 'totals',
  SPR: 'spread',
  BTTS: 'both-teams-to-score',
  OUTRIGHTS: 'outrights',
  GAME_HANDICAP: 'spread',
};

const BOOK_MAP: Record<string, BookmakerId> = {
  OPENBOOK: 'openbook',
  BETFAIR: 'betfair',
  NORTHLINE: 'northline',
  APEX: 'apex',
  MERIDIAN: 'meridian',
};

export const MARKET_LABELS: Record<MarketKey, string> = {
  'match-winner': 'Match Winner (1X2)',
  moneyline: 'Moneyline',
  totals: 'Totals O/U 2.5',
  spread: 'Spread / Handicap',
  'both-teams-to-score': 'Both Teams To Score',
  outrights: 'Outrights / Tournament Winner',
};

export const SPORT_LABELS: Record<SportKey, string> = {
  soccer: 'Soccer',
  basketball: 'Basketball',
  americanfootball: 'American Football',
  icehockey: 'Ice Hockey',
  baseball: 'Baseball',
  tennis: 'Tennis',
  volleyball: 'Volleyball',
  golf: 'Golf',
  handball: 'Handball',
  rugby: 'Rugby',
  tabletennis: 'Table Tennis',
  darts: 'Darts',
  cricket: 'Cricket',
  aussierules: 'Aussie Rules',
};

const STALE_THRESHOLD_MINUTES = 30;
const MIN_DECIMAL_ODDS = 1.01;
const MAX_DECIMAL_ODDS = 1000;

function normalizeTeam(raw: RawTeam): Team {
  return {
    id: raw.key,
    name: raw.name,
    shortName: raw.abbr,
    rating: raw.power_index,
    form: raw.recent_form
      .split(',')
      .map((f) => f.trim().toUpperCase())
      .filter((f): f is 'W' | 'D' | 'L' => f === 'W' || f === 'D' || f === 'L'),
    injuriesOut: raw.injuries_out ?? 0,
  };
}

function normalizeStatus(state: string): EventStatus {
  switch (state.toUpperCase()) {
    case 'LIVE':
      return 'live';
    case 'FINAL':
    case 'ENDED':
      return 'final';
    default:
      return 'scheduled';
  }
}

/** Stage 2: Normalization — raw provider payload -> canonical sports domain. */
export function normalizeEvents(
  raws: readonly RawProviderEvent[],
): NormalizationResult<SportEvent[]> {
  const issues: NormalizationIssue[] = [];
  const events: SportEvent[] = [];
  let dropped = 0;

  for (const raw of raws) {
    const sportKey = SPORT_MAP[raw.sport];
    if (!sportKey) {
      dropped += 1;
      issues.push({
        code: 'unknown-market',
        severity: 'warning',
        message: `Unsupported sport “${raw.sport}” dropped during normalization`,
        reference: raw.event_key,
      });
      continue;
    }
    if (!raw.home.key || !raw.away.key) {
      dropped += 1;
      issues.push({
        code: 'unmapped-team',
        severity: 'error',
        message: 'Event dropped: unmapped competitor identity',
        reference: raw.event_key,
      });
      continue;
    }
    const league: League = {
      id: `${sportKey}-${raw.competition.toLowerCase().replace(/\s+/g, '-')}`,
      name: raw.competition,
      sportKey,
      country: raw.country,
    };
    if (raw.liquidity_index === null) {
      issues.push({
        code: 'odds-missing',
        severity: 'info',
        message: 'Liquidity index missing; defaulted to 0.5',
        reference: raw.event_key,
      });
    }
    events.push({
      id: raw.event_key,
      sportKey,
      league,
      homeTeam: normalizeTeam(raw.home),
      awayTeam: normalizeTeam(raw.away),
      startTime: raw.commence_time,
      status: normalizeStatus(raw.state),
      venue: raw.venue,
      monitored: raw.monitored === 1,
      liquidity: raw.liquidity_index ?? 0.5,
    });
  }

  return { value: events, issues, droppedRecords: dropped };
}

/** Stage 3: Odds snapshots — validated, canonical, immutable captures. */
export function normalizeOddsSnapshots(
  raws: readonly RawOddsRecord[],
  knownEventIds: ReadonlySet<string>,
  now: Date = new Date(),
): NormalizationResult<OddsSnapshot[]> {
  const issues: NormalizationIssue[] = [];
  const snapshots: OddsSnapshot[] = [];
  let dropped = 0;

  for (const raw of raws) {
    const market = MARKET_MAP[raw.market];
    const bookmaker = BOOK_MAP[raw.book];
    if (!market || !bookmaker || !knownEventIds.has(raw.event_key)) {
      dropped += 1;
      if (!market) {
        issues.push({
          code: 'unknown-market',
          severity: 'warning',
          message: `Unknown market code “${raw.market}” dropped`,
          reference: raw.snapshot_key,
        });
      }
      continue;
    }

    const quotes: OddsQuote[] = [];
    for (const price of raw.prices) {
      const numeric = price.price === null ? NaN : Number(price.price);
      if (!Number.isFinite(numeric)) {
        issues.push({
          code: 'odds-missing',
          severity: 'warning',
          message: `Missing price for “${price.name}”`,
          reference: raw.snapshot_key,
        });
        continue;
      }
      if (numeric < MIN_DECIMAL_ODDS || numeric > MAX_DECIMAL_ODDS) {
        issues.push({
          code: 'odds-out-of-range',
          severity: 'error',
          message: `Price ${numeric} for “${price.name}” outside accepted range`,
          reference: raw.snapshot_key,
        });
        continue;
      }
      quotes.push({
        selectionId: price.sel,
        label: price.name,
        decimalOdds: Number(numeric.toFixed(3)),
      });
    }

    if (quotes.length === 0) {
      dropped += 1;
      continue;
    }

    const ageMinutes = (now.getTime() - new Date(raw.ts).getTime()) / 60_000;
    if (ageMinutes > STALE_THRESHOLD_MINUTES) {
      issues.push({
        code: 'stale-odds',
        severity: 'info',
        message: `Snapshot older than ${STALE_THRESHOLD_MINUTES} minutes (${Math.round(ageMinutes)}m)`,
        reference: raw.snapshot_key,
      });
    }

    snapshots.push({
      id: raw.snapshot_key,
      eventId: raw.event_key,
      market,
      bookmaker,
      capturedAt: raw.ts,
      quotes,
      feedLatencyMs: raw.latency_ms,
      provider: raw.provider,
    });
  }

  snapshots.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  return { value: snapshots, issues, droppedRecords: dropped };
}
