/**
 * Raw provider feed (stage 1 of the pipeline).
 * Shapes intentionally mirror a messy third-party payload: string prices,
 * nullable fields, provider-specific market codes.
 */

export interface RawTeam {
  key: string;
  name: string;
  abbr: string;
  power_index: number;
  recent_form: string;
  injuries_out: number | null;
}

export interface RawProviderEvent {
  event_key: string;
  sport: string;
  competition: string;
  country: string;
  home: RawTeam;
  away: RawTeam;
  commence_time: string;
  state: string;
  venue: string;
  liquidity_index: number | null;
  monitored: 0 | 1;
}

export interface RawPrice {
  sel: string;
  name: string;
  price: string | number | null;
}

export interface RawOddsRecord {
  snapshot_key: string;
  event_key: string;
  market: string;
  book: string;
  ts: string;
  prices: RawPrice[];
  latency_ms: number;
  provider: string;
}

/** Deterministic PRNG so every session renders identical mock history. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Anchor “now” once so all relative timestamps stay stable during a session. */
export const FEED_NOW = new Date();

function iso(minutesFromNow: number): string {
  return new Date(FEED_NOW.getTime() + minutesFromNow * 60_000).toISOString();
}

const rawEvents: RawProviderEvent[] = [
  {
    event_key: 'EVT-SOC-1001',
    sport: 'SOCCER',
    competition: 'Premier League',
    country: 'England',
    home: { key: 'team-ars', name: 'Arsenal', abbr: 'ARS', power_index: 1798, recent_form: 'W,W,D,W,L', injuries_out: 2 },
    away: { key: 'team-liv', name: 'Liverpool', abbr: 'LIV', power_index: 1822, recent_form: 'W,D,W,W,W', injuries_out: 1 },
    commence_time: iso(186),
    state: 'SCHEDULED',
    venue: 'Emirates Stadium',
    liquidity_index: 0.93,
    monitored: 1,
  },
  {
    event_key: 'EVT-BAS-2002',
    sport: 'BASKET',
    competition: 'NBA',
    country: 'USA',
    home: { key: 'team-bos', name: 'Boston Celtics', abbr: 'BOS', power_index: 1744, recent_form: 'W,W,W,L,W', injuries_out: 1 },
    away: { key: 'team-lal', name: 'Los Angeles Lakers', abbr: 'LAL', power_index: 1668, recent_form: 'L,W,L,W,D', injuries_out: 3 },
    commence_time: iso(320),
    state: 'SCHEDULED',
    venue: 'TD Garden',
    liquidity_index: 0.88,
    monitored: 1,
  },
  {
    event_key: 'EVT-SOC-1002',
    sport: 'SOCCER',
    competition: 'La Liga',
    country: 'Spain',
    home: { key: 'team-rma', name: 'Real Madrid', abbr: 'RMA', power_index: 1861, recent_form: 'W,W,W,D,W', injuries_out: 0 },
    away: { key: 'team-vil', name: 'Villarreal', abbr: 'VIL', power_index: 1652, recent_form: 'D,L,W,D,W', injuries_out: 2 },
    commence_time: iso(94),
    state: 'SCHEDULED',
    venue: 'Santiago Bernabéu',
    liquidity_index: 0.9,
    monitored: 1,
  },
  {
    event_key: 'EVT-NFL-3001',
    sport: 'AMERICAN_FOOTBALL',
    competition: 'NFL',
    country: 'USA',
    home: { key: 'team-kc', name: 'Kansas City Chiefs', abbr: 'KC', power_index: 1781, recent_form: 'W,W,L,W,W', injuries_out: 2 },
    away: { key: 'team-buf', name: 'Buffalo Bills', abbr: 'BUF', power_index: 1759, recent_form: 'W,L,W,W,L', injuries_out: 4 },
    commence_time: iso(1425),
    state: 'SCHEDULED',
    venue: 'Arrowhead Stadium',
    liquidity_index: 0.95,
    monitored: 1,
  },
  {
    event_key: 'EVT-NHL-4001',
    sport: 'ICE_HOCKEY',
    competition: 'NHL',
    country: 'USA',
    home: { key: 'team-nyr', name: 'New York Rangers', abbr: 'NYR', power_index: 1611, recent_form: 'L,W,W,D,L', injuries_out: 3 },
    away: { key: 'team-tor', name: 'Toronto Maple Leafs', abbr: 'TOR', power_index: 1638, recent_form: 'W,W,L,W,D', injuries_out: 1 },
    commence_time: iso(238),
    state: 'SCHEDULED',
    venue: 'Madison Square Garden',
    liquidity_index: 0.71,
    monitored: 1,
  },
  {
    event_key: 'EVT-MLB-5001',
    sport: 'BASEBALL',
    competition: 'MLB',
    country: 'USA',
    home: { key: 'team-nyc-m', name: 'New York Mets', abbr: 'NYM', power_index: 1542, recent_form: 'L,L,W,D,W', injuries_out: 2 },
    away: { key: 'team-lad', name: 'Los Angeles Dodgers', abbr: 'LAD', power_index: 1702, recent_form: 'W,W,W,W,L', injuries_out: 1 },
    commence_time: iso(512),
    state: 'SCHEDULED',
    venue: 'Citi Field',
    liquidity_index: 0.62,
    monitored: 0,
  },
  {
    event_key: 'EVT-SOC-1003',
    sport: 'SOCCER',
    competition: 'Serie A',
    country: 'Italy',
    home: { key: 'team-int', name: 'Inter', abbr: 'INT', power_index: 1774, recent_form: 'W,D,W,W,D', injuries_out: 1 },
    away: { key: 'team-nap', name: 'Napoli', abbr: 'NAP', power_index: 1731, recent_form: 'D,W,L,W,W', injuries_out: 2 },
    commence_time: iso(-38),
    state: 'LIVE',
    venue: 'San Siro',
    liquidity_index: 0.84,
    monitored: 1,
  },
  {
    event_key: 'EVT-BAS-2003',
    sport: 'BASKET',
    competition: 'NBA',
    country: 'USA',
    home: { key: 'team-den', name: 'Denver Nuggets', abbr: 'DEN', power_index: 1729, recent_form: 'W,L,W,W,W', injuries_out: 0 },
    away: { key: 'team-phx', name: 'Phoenix Suns', abbr: 'PHX', power_index: 1664, recent_form: 'L,L,W,L,W', injuries_out: 2 },
    commence_time: iso(402),
    state: 'SCHEDULED',
    venue: 'Ball Arena',
    liquidity_index: 0.79,
    monitored: 0,
  },
  {
    event_key: 'EVT-SOC-1004',
    sport: 'SOCCER',
    competition: 'Bundesliga',
    country: 'Germany',
    home: { key: 'team-bay', name: 'Bayern München', abbr: 'BAY', power_index: 1845, recent_form: 'W,W,W,W,D', injuries_out: 1 },
    away: { key: 'team-lev', name: 'Bayer Leverkusen', abbr: 'LEV', power_index: 1768, recent_form: 'W,D,W,L,W', injuries_out: 3 },
    commence_time: iso(1180),
    state: 'SCHEDULED',
    venue: 'Allianz Arena',
    liquidity_index: 0.87,
    monitored: 1,
  },
  {
    event_key: 'EVT-UNK-9001',
    sport: 'PADEL',
    competition: 'World Padel Tour',
    country: 'Spain',
    home: { key: 'team-p1', name: 'Lebrón / Galan', abbr: 'LG', power_index: 1500, recent_form: 'W,W,L,W,W', injuries_out: null },
    away: { key: 'team-p2', name: 'Tapia / Coello', abbr: 'TC', power_index: 1520, recent_form: 'W,W,W,L,W', injuries_out: null },
    commence_time: iso(260),
    state: 'SCHEDULED',
    venue: 'Madrid Arena',
    liquidity_index: null,
    monitored: 0,
  },
];

interface SeriesSpec {
  eventKey: string;
  market: string;
  books: string[];
  selections: Array<{ sel: string; name: string; open: number; drift: number }>;
  points: number;
  intervalMinutes: number;
  /** Minutes ago the last capture happened (models stale feeds). */
  lastCaptureMinutesAgo: number;
  seed: number;
  anomalies?: { nullPriceAt?: number; outOfRangeAt?: number; dropBookAfter?: number };
}

const seriesSpecs: SeriesSpec[] = [
  {
    eventKey: 'EVT-SOC-1001',
    market: '1X2',
    books: ['OPENBOOK', 'BETFAIR', 'NORTHLINE', 'APEX'],
    selections: [
      { sel: 'home', name: 'Arsenal', open: 2.62, drift: 0.24 },
      { sel: 'draw', name: 'Draw', open: 3.5, drift: -0.05 },
      { sel: 'away', name: 'Liverpool', open: 2.75, drift: -0.31 },
    ],
    points: 9,
    intervalMinutes: 22,
    lastCaptureMinutesAgo: 3,
    seed: 1001,
  },
  {
    eventKey: 'EVT-BAS-2002',
    market: 'ML',
    books: ['OPENBOOK', 'BETFAIR', 'MERIDIAN'],
    selections: [
      { sel: 'home', name: 'Boston Celtics', open: 1.52, drift: -0.07 },
      { sel: 'away', name: 'Los Angeles Lakers', open: 2.58, drift: 0.34 },
    ],
    points: 8,
    intervalMinutes: 30,
    lastCaptureMinutesAgo: 6,
    seed: 2002,
  },
  {
    eventKey: 'EVT-SOC-1002',
    market: '1X2',
    books: ['OPENBOOK', 'NORTHLINE'],
    selections: [
      { sel: 'home', name: 'Real Madrid', open: 1.44, drift: 0.05 },
      { sel: 'draw', name: 'Draw', open: 4.8, drift: -0.2 },
      { sel: 'away', name: 'Villarreal', open: 7.2, drift: -0.6 },
    ],
    points: 6,
    intervalMinutes: 26,
    lastCaptureMinutesAgo: 41,
    seed: 1002,
    anomalies: { nullPriceAt: 4 },
  },
  {
    eventKey: 'EVT-NFL-3001',
    market: 'SPR',
    books: ['OPENBOOK', 'BETFAIR', 'APEX', 'MERIDIAN', 'NORTHLINE'],
    selections: [
      { sel: 'home-spread', name: 'Kansas City Chiefs -2.5', open: 1.95, drift: -0.09 },
      { sel: 'away-spread', name: 'Buffalo Bills +2.5', open: 1.92, drift: 0.11 },
    ],
    points: 10,
    intervalMinutes: 45,
    lastCaptureMinutesAgo: 2,
    seed: 3001,
  },
  {
    eventKey: 'EVT-NHL-4001',
    market: 'ML',
    books: ['OPENBOOK', 'APEX'],
    selections: [
      { sel: 'home', name: 'New York Rangers', open: 2.35, drift: -0.28 },
      { sel: 'away', name: 'Toronto Maple Leafs', open: 1.68, drift: 0.16 },
    ],
    points: 5,
    intervalMinutes: 24,
    lastCaptureMinutesAgo: 34,
    seed: 4001,
    anomalies: { outOfRangeAt: 3, dropBookAfter: 3 },
  },
  {
    eventKey: 'EVT-MLB-5001',
    market: 'ML',
    books: ['OPENBOOK', 'MERIDIAN', 'NORTHLINE'],
    selections: [
      { sel: 'home', name: 'New York Mets', open: 2.9, drift: 0.12 },
      { sel: 'away', name: 'Los Angeles Dodgers', open: 1.46, drift: -0.04 },
    ],
    points: 7,
    intervalMinutes: 35,
    lastCaptureMinutesAgo: 12,
    seed: 5001,
  },
  {
    eventKey: 'EVT-SOC-1003',
    market: 'OU',
    books: ['OPENBOOK', 'BETFAIR', 'APEX'],
    selections: [
      { sel: 'over-2.5', name: 'Over 2.5', open: 1.88, drift: -0.22 },
      { sel: 'under-2.5', name: 'Under 2.5', open: 1.96, drift: 0.29 },
    ],
    points: 9,
    intervalMinutes: 12,
    lastCaptureMinutesAgo: 1,
    seed: 1003,
  },
  {
    eventKey: 'EVT-BAS-2003',
    market: 'ML',
    books: ['OPENBOOK', 'BETFAIR'],
    selections: [
      { sel: 'home', name: 'Denver Nuggets', open: 1.61, drift: 0.03 },
      { sel: 'away', name: 'Phoenix Suns', open: 2.38, drift: -0.05 },
    ],
    points: 6,
    intervalMinutes: 28,
    lastCaptureMinutesAgo: 9,
    seed: 2003,
  },
  {
    eventKey: 'EVT-SOC-1004',
    market: 'BTTS',
    books: ['OPENBOOK', 'NORTHLINE', 'MERIDIAN'],
    selections: [
      { sel: 'btts-yes', name: 'Both teams to score – Yes', open: 1.72, drift: 0.14 },
      { sel: 'btts-no', name: 'Both teams to score – No', open: 2.1, drift: -0.18 },
    ],
    points: 8,
    intervalMinutes: 40,
    lastCaptureMinutesAgo: 5,
    seed: 1004,
  },
  {
    eventKey: 'EVT-UNK-9001',
    market: 'GAME_HANDICAP',
    books: ['OPENBOOK'],
    selections: [
      { sel: 'home', name: 'Lebrón / Galan', open: 1.9, drift: 0.02 },
      { sel: 'away', name: 'Tapia / Coello', open: 1.9, drift: -0.02 },
    ],
    points: 3,
    intervalMinutes: 20,
    lastCaptureMinutesAgo: 15,
    seed: 9001,
  },
];

function buildOddsRecords(): RawOddsRecord[] {
  const records: RawOddsRecord[] = [];
  for (const spec of seriesSpecs) {
    const rnd = mulberry32(spec.seed);
    spec.books.forEach((book, bookIndex) => {
      const bookBias = (bookIndex - spec.books.length / 2) * 0.012;
      for (let p = 0; p < spec.points; p += 1) {
        if (spec.anomalies?.dropBookAfter !== undefined && bookIndex > 0 && p > spec.anomalies.dropBookAfter) {
          continue;
        }
        const progress = spec.points === 1 ? 1 : p / (spec.points - 1);
        const minutesAgo = spec.lastCaptureMinutesAgo + (spec.points - 1 - p) * spec.intervalMinutes;
        const prices: RawPrice[] = spec.selections.map((sel, selIndex) => {
          const noise = (rnd() - 0.5) * 0.045;
          let price = sel.open + sel.drift * progress + noise + bookBias * (selIndex + 1);
          price = Math.max(1.02, price);
          if (spec.anomalies?.nullPriceAt === p && bookIndex === 0 && selIndex === 1) {
            return { sel: sel.sel, name: sel.name, price: null };
          }
          if (spec.anomalies?.outOfRangeAt === p && bookIndex === 0 && selIndex === 0) {
            return { sel: sel.sel, name: sel.name, price: '0.84' };
          }
          return { sel: sel.sel, name: sel.name, price: price.toFixed(3) };
        });
        records.push({
          snapshot_key: `SNP-${spec.eventKey}-${book}-${p}`,
          event_key: spec.eventKey,
          market: spec.market,
          book,
          ts: iso(-minutesAgo),
          prices,
          latency_ms: Math.round(90 + rnd() * 460),
          provider: bookIndex % 2 === 0 ? 'feed-alpha' : 'feed-beta',
        });
      }
    });
  }
  return records;
}

export const RAW_EVENTS: readonly RawProviderEvent[] = Object.freeze(rawEvents);
export const RAW_ODDS: readonly RawOddsRecord[] = Object.freeze(buildOddsRecords());
