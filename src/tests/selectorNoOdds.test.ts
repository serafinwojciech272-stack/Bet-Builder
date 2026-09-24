import { describe, expect, it } from 'vitest';
import {
  buildEventIntel,
  dataQualityAlerts,
  notableMovements,
  NO_ODDS_MARKET_LABEL,
  riskAlerts,
  topValueSignals,
} from '../state/selectors';
import type { CanonicalDataset } from '../domain/repositories';
import type { OddsSnapshot, SportEvent } from '../domain/types';

/**
 * Regression guard for the UI/selector layer: a real provider payload with events
 * but `snapshots: []` (LIVE_DATA_NO_ODDS) must still surface every event. The
 * selector previously dropped any event lacking a primary market, which made the
 * real no-odds events invisible on the dashboard, explorer and analysis page even
 * though the analysis service handled them.
 */
const BASKETBALL: [string, string, string, string] = [
  'thesportsdb:2449218',
  'basketball',
  'wnba',
  'New York Liberty',
];

function event(index: number): SportEvent {
  const [id, sportKey, leagueId, home] = BASKETBALL;
  return {
    id: `${id}-${index}`,
    sportKey: sportKey as SportEvent['sportKey'],
    league: { id: leagueId, name: leagueId, sportKey: sportKey as SportEvent['sportKey'], country: 'US' },
    homeTeam: { id: `h-${index}`, name: `${home} ${index}`, shortName: home, rating: 0.5, form: [], injuriesOut: 0 },
    awayTeam: { id: `a-${index}`, name: `Atlanta Dream ${index}`, shortName: 'Atlanta', rating: 0.5, form: [], injuriesOut: 0 },
    startTime: '2026-09-24T18:00:00.000Z',
    status: 'scheduled',
    venue: '',
    monitored: true,
    liquidity: 0.5,
  };
}

function noOddsDataset(count: number): CanonicalDataset {
  const events = Array.from({ length: count }, (_, i) => event(i));
  return {
    events,
    snapshots: [] as OddsSnapshot[],
    issues: [],
    droppedRecords: 0,
    normalizedAt: '2026-09-24T17:46:20.235Z',
    provider: 'thesportsdb',
    mode: 'LIVE_DATA_NO_ODDS',
    requestedDate: '2026-09-24',
    sportsQueried: ['basketball'],
    bookmakers: [],
    availableSports: [],
  };
}

describe('selectors — real no-odds events remain visible', () => {
  it('retains every event instead of dropping the ones without a market', () => {
    const dataset = noOddsDataset(18);
    const intel = buildEventIntel(dataset, new Date('2026-09-24T18:00:00.000Z'));
    expect(intel).toHaveLength(18);
    expect(intel.map((i) => i.event.id)).toEqual(dataset.events.map((e) => e.id));
    for (const i of intel) {
      expect(i.market).toBeNull();
      expect(i.marketLabel).toBe(NO_ODDS_MARKET_LABEL);
      expect(i.movement).toBeNull();
      // Placeholder signals must never claim an edge or a real price.
      for (const s of i.value.signals) {
        expect(s.tier).toBe('none');
        expect(s.edgePct.value).toBe(0);
        expect(s.bestBookmaker).toBeNull();
      }
    }
  });

  it('keeps derived feed rows safe when events carry no odds', () => {
    const intel = buildEventIntel(noOddsDataset(3), new Date('2026-09-24T18:00:00.000Z'));
    expect(() => notableMovements(intel)).not.toThrow();
    expect(notableMovements(intel)).toEqual([]);
    expect(() => topValueSignals(intel)).not.toThrow();
    expect(topValueSignals(intel)).toEqual([]);
    expect(() => dataQualityAlerts(intel)).not.toThrow();
    expect(() => riskAlerts(intel)).not.toThrow();
    // Risk/quality are still deterministic even without a market.
    for (const i of intel) {
      expect(Number.isFinite(i.risk.score.value)).toBe(true);
      expect(Number.isFinite(i.quality.score.value)).toBe(true);
      expect(i.risk.factors.every((f) => Number.isFinite(f.score.value) && Number.isFinite(f.weight.value))).toBe(true);
    }
  });

  it('still resolves a real market and label when snapshots are present', () => {
    const dataset = noOddsDataset(1);
    const withOdds: CanonicalDataset = {
      ...dataset,
      snapshots: [
        {
          id: 's1',
          eventId: dataset.events[0].id,
          bookmaker: 'pinnacle',
          market: 'match-winner',
          capturedAt: '2026-09-24T17:55:00.000Z',
          feedLatencyMs: 120,
          provider: 'thesportsdb',
          quotes: [
            { selectionId: 'sel-home', label: 'Home', decimalOdds: 1.8 },
            { selectionId: 'sel-away', label: 'Away', decimalOdds: 2.1 },
          ],
        },
      ],
      mode: 'LIVE',
    };
    const [first] = buildEventIntel(withOdds, new Date('2026-09-24T18:00:00.000Z'));
    expect(first.market).toBe('match-winner');
    expect(first.marketLabel).not.toBe(NO_ODDS_MARKET_LABEL);
    expect(first.movement).not.toBeNull();
  });
});
