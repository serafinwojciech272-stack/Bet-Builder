import type { Event, Market, OddsSnapshot, Selection } from '../domain/types';
import { buildMarketsForEvent, type DemoMarketSpec } from './demoData';

// Deterministic demo seed. NOT real bookmaker or provider data.

const H = 3600_000;
const now = Date.now();

export interface DemoDataset {
  events: Event[];
  markets: Market[];
  selections: Selection[];
  histories: Record<string, OddsSnapshot[]>;
}

function event(id: string, sport: string, league: string, competition: string, home: string, away: string, startOffsetMs: number, status: 'SCHEDULED' | 'LIVE' | 'FINISHED' = 'SCHEDULED'): Event {
  return {
    id,
    sport,
    league,
    competition,
    homeTeam: home,
    awayTeam: away,
    startTime: new Date(now + startOffsetMs).toISOString(),
    status,
  };
}

const FOOTBALL_MARKETS: DemoMarketSpec[] = [
  {
    market: { type: 'Match Winner', name: 'Match Winner', category: 'Match Result' },
    selections: [
      { name: 'Home', shortName: 'Home', odds: 2.1 },
      { name: 'Draw', shortName: 'Draw', odds: 3.4 },
      { name: 'Away', shortName: 'Away', odds: 3.2 },
    ],
  },
  {
    market: { type: 'Double Chance', name: 'Double Chance', category: 'Match Result' },
    selections: [
      { name: 'Home or Draw', shortName: '1X', odds: 1.35 },
      { name: 'Home or Away', shortName: '12', odds: 1.12 },
      { name: 'Draw or Away', shortName: 'X2', odds: 1.8 },
    ],
  },
  {
    market: { type: 'Draw No Bet', name: 'Draw No Bet', category: 'Match Result' },
    selections: [
      { name: 'Home', shortName: 'Home', odds: 1.45 },
      { name: 'Away', shortName: 'Away', odds: 2.6 },
    ],
  },
  {
    market: { type: 'Over/Under', name: 'Total Goals', category: 'Goals' },
    selections: [
      { name: 'Over 0.5', shortName: 'Over 0.5', odds: 1.04, line: 0.5 },
      { name: 'Over 1.5', shortName: 'Over 1.5', odds: 1.5, line: 1.5 },
      { name: 'Over 2.5', shortName: 'Over 2.5', odds: 1.72, line: 2.5, correlationGroup: 'goals-groups' },
      { name: 'Over 3.5', shortName: 'Over 3.5', odds: 2.5, line: 3.5 },
      { name: 'Under 2.5', shortName: 'Under 2.5', odds: 2.05, line: 2.5 },
    ],
  },
  {
    market: { type: 'BTTS', name: 'Both Teams To Score', category: 'Goals' },
    selections: [
      { name: 'Yes', shortName: 'Yes', odds: 1.65, correlationGroup: 'corr-over25-btts' },
      { name: 'No', shortName: 'No', odds: 2.15, correlationGroup: 'corr-under-btts-no' },
    ],
  },
  {
    market: { type: 'Corners', name: 'Corners', category: 'In-Play Stats' },
    selections: [
      { name: 'Over 9.5 Corners', shortName: 'Over 9.5', odds: 1.8, line: 9.5 },
      { name: 'Under 9.5 Corners', shortName: 'Under 9.5', odds: 1.95, line: 9.5 },
    ],
  },
];

export function createSeedDataset(): DemoDataset {
  const events: Event[] = [
    event('ev1', 'Football', 'Premier League', 'Football', 'Manchester City', 'Aston Villa', 2 * H, 'SCHEDULED'),
    event('ev2', 'Football', 'La Liga', 'Football', 'Real Madrid', 'Sevilla', 5 * H),
    event('ev3', 'Football', 'Serie A', 'Football', 'Inter Milan', 'Napoli', 26 * H),
    event('ev4', 'Basketball', 'NBA', 'Basketball', 'Boston Celtics', 'Denver Nuggets', 4 * H, 'SCHEDULED'),
    event('ev5', 'Basketball', 'EuroLeague', 'Basketball', 'Real Madrid BC', 'Fenerbahce', 30 * H),
    event('ev6', 'Tennis', 'ATP Masters', 'Tennis', 'C. Alcaraz', 'J. Sinner', 8 * H),
    event('ev7', 'Ice Hockey', 'NHL', 'Ice Hockey', 'Toronto Maple Leafs', 'Boston Bruins', 12 * H),
    event('ev8', 'Baseball', 'MLB', 'Baseball', 'New York Yankees', 'Boston Red Sox', 7 * H),
  ];

  const specsByEvent: Record<string, DemoMarketSpec[]> = {
    ev1: FOOTBALL_MARKETS,
    ev2: FOOTBALL_MARKETS,
    ev3: FOOTBALL_MARKETS,
  };

  // give Over 2.5 + BTTS Yes a shared correlation group on ev1
  const markets: Market[] = [];
  const selections: Selection[] = [];
  const histories: Record<string, OddsSnapshot[]> = {};

  for (const ev of events) {
    let specs: DemoMarketSpec[] = specsByEvent[ev.id] ?? [];
    if (ev.sport === 'Football' && ev.id === 'ev1') {
      specs = FOOTBALL_MARKETS.map((s) => ({
        ...s,
        selections: s.selections.map((sel) => {
          if ((s.market.type === 'Over/Under' && sel.shortName === 'Over 2.5') || (s.market.type === 'BTTS' && sel.shortName === 'Yes')) {
            return { ...sel, correlationGroup: 'corr-over25-btts' };
          }
          // Home Over 1.5 team goals correlated with Home win
          if (s.market.type === 'Match Winner' && sel.shortName === 'Home') {
            return { ...sel, correlationGroup: 'corr-homewin-tig' };
          }
          return sel;
        }),
      }));
    }
    if (ev.sport === 'Basketball') {
      specs = [
        {
          market: { type: 'Moneyline', name: 'Moneyline', category: 'Match Result' },
          selections: [
            { name: 'Boston Celtics', shortName: 'Celtics', odds: 1.5 },
            { name: 'Denver Nuggets', shortName: 'Nuggets', odds: 2.6 },
          ],
        },
        {
          market: { type: 'Spread', name: 'Point Spread', category: 'Handicap' },
          selections: [
            { name: 'Celtics -4.5', shortName: 'Celtics -4.5', odds: 1.9, line: -4.5 },
            { name: 'Nuggets +4.5', shortName: 'Nuggets +4.5', odds: 1.9, line: 4.5 },
          ],
        },
        {
          market: { type: 'Total Points', name: 'Total Points', category: 'Totals' },
          selections: [
            { name: 'Over 218.5', shortName: 'Over 218.5', odds: 1.85, line: 218.5 },
            { name: 'Under 218.5', shortName: 'Under 218.5', odds: 1.95, line: 218.5 },
          ],
        },
      ];
    }
    if (ev.sport === 'Tennis') {
      specs = [
        {
          market: { type: 'Match Winner', name: 'Match Winner', category: 'Match Result' },
          selections: [
            { name: 'C. Alcaraz', shortName: 'Alcaraz', odds: 1.7 },
            { name: 'J. Sinner', shortName: 'Sinner', odds: 2.15 },
          ],
        },
        {
          market: { type: 'Set Winner', name: 'Set Winner', category: 'Game Markets' },
          selections: [
            { name: 'Alcaraz (Sets)', shortName: 'Alcaraz Sets', odds: 1.6 },
            { name: 'Sinner (Sets)', shortName: 'Sinner Sets', odds: 2.3 },
          ],
        },
        {
          market: { type: 'Total Games', name: 'Total Games', category: 'Totals' },
          selections: [
            { name: 'Over 21.5', shortName: 'Over 21.5', odds: 1.78, line: 21.5 },
            { name: 'Under 21.5', shortName: 'Under 21.5', odds: 2.02, line: 21.5 },
          ],
        },
      ];
    }
    if (ev.sport === 'Ice Hockey') {
      specs = [
        {
          market: { type: 'Moneyline', name: 'Moneyline', category: 'Match Result' },
          selections: [
            { name: 'Toronto Maple Leafs', shortName: 'Leafs', odds: 2.3 },
            { name: 'Boston Bruins', shortName: 'Bruins', odds: 1.65 },
          ],
        },
        {
          market: { type: 'Total Goals', name: 'Total Goals', category: 'Totals' },
          selections: [
            { name: 'Over 5.5', shortName: 'Over 5.5', odds: 1.7, line: 5.5 },
            { name: 'Under 5.5', shortName: 'Under 5.5', odds: 2.1, line: 5.5 },
          ],
        },
      ];
    }
    if (ev.sport === 'Baseball') {
      specs = [
        {
          market: { type: 'Moneyline', name: 'Moneyline', category: 'Match Result' },
          selections: [
            { name: 'New York Yankees', shortName: 'Yankees', odds: 1.55 },
            { name: 'Boston Red Sox', shortName: 'Red Sox', odds: 2.5 },
          ],
        },
        {
          market: { type: 'Total Runs', name: 'Total Runs', category: 'Totals' },
          selections: [
            { name: 'Over 8.5', shortName: 'Over 8.5', odds: 1.85, line: 8.5 },
            { name: 'Under 8.5', shortName: 'Under 8.5', odds: 1.95, line: 8.5 },
          ],
        },
      ];
    }

    const built = buildMarketsForEvent(ev.id, specs);
    markets.push(...built.markets);
    selections.push(...built.selections);
    Object.assign(histories, built.histories);
  }

  return { events, markets, selections, histories };
}
