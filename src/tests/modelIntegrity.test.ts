import { describe, expect, it } from 'vitest';
import { buildDailyCoupon } from '../core/dailyCoupon';
import { computeAnchoredModelProbabilities, computeModelProbabilities, isEventModelInformed } from '../domain/services/probabilityService';
import type { OddsSnapshot, SportEvent } from '../domain/types';

const team = (name: string, rating = 0.5) => ({ id: name, name, shortName: name, rating, form: [] as Array<'W' | 'D' | 'L'>, injuriesOut: 0 });
const event = (id: string, home: string, away: string, rating = 0.5): SportEvent => ({
  id, sportKey: 'soccer', league: { id: 'l', name: 'League', sportKey: 'soccer', country: 'PL' },
  homeTeam: team(home, rating), awayTeam: team(away, rating), startTime: '2026-09-28T18:00:00Z',
  status: 'scheduled', venue: '', monitored: true, liquidity: 0.8,
});
const snap = (eventId: string, bookmaker: string, home: number, draw: number, away: number): OddsSnapshot => ({
  id: eventId + bookmaker, eventId, market: 'match-winner', bookmaker, capturedAt: '2026-09-28T08:00:00Z', feedLatencyMs: 1000, provider: 'test',
  quotes: [
    { selectionId: eventId + ':home', label: 'Home', decimalOdds: home },
    { selectionId: eventId + ':draw', label: 'Draw', decimalOdds: draw },
    { selectionId: eventId + ':away', label: 'Away', decimalOdds: away },
  ],
});

describe('model integrity', () => {
  it('detects placeholder team data as uninformed', () => {
    expect(isEventModelInformed(event('x', 'A', 'B'))).toBe(false);
    expect(isEventModelInformed(event('x', 'A', 'B', 1800))).toBe(true);
  });

  it('does not fabricate value on a home underdog when team data is missing', () => {
    const ev = event('m', 'Lechia', 'Real Madrid');
    const ids = ['m:home', 'm:draw', 'm:away'];
    const snapshots = [snap('m', 'STS', 11, 6.5, 1.22), snap('m', 'Superbet', 10.5, 6.6, 1.23)];
    const raw = computeModelProbabilities(ev, 'match-winner', ids);
    expect(raw.informed).toBe(false);
    expect(raw.probabilities[0].probability.value).toBeGreaterThan(0.4); // the bug this guards against

    const anchored = computeAnchoredModelProbabilities(ev, 'match-winner', ids, snapshots);
    expect(anchored.source).toBe('market-consensus');
    const home = anchored.probabilities.find((p) => p.selectionId === 'm:home')!.probability.value;
    expect(home).toBeLessThan(0.12);
    expect(home * 11 - 1).toBeLessThan(0.05);
  });

  it('daily coupon never promotes a single-bookmaker price with normal margin', () => {
    const result = buildDailyCoupon({
      date: '2026-09-28', events: [event('a', 'A', 'B')],
      snapshots: [snap('a', 'STS', 2.3, 3.3, 3.1)], bookmakers: ['STS'], stake: 10, minOdds: 1.2, maxOdds: 5,
    });
    expect(result.legs).toHaveLength(0);
  });

  it('daily coupon selects only prices above the multi-bookmaker consensus', () => {
    const result = buildDailyCoupon({
      date: '2026-09-28', events: [event('a', 'A', 'B')],
      snapshots: [snap('a', 'STS', 2.3, 3.3, 3.1), snap('a', 'Superbet', 2.25, 3.35, 3.15), snap('a', 'Other', 2.6, 3.2, 3.0)],
      stake: 10, minOdds: 1.2, maxOdds: 5,
    });
    expect(result.legs).toHaveLength(1);
    expect(result.legs[0].selection).toBe('Home');
    expect(result.legs[0].odds).toBe(2.6);
    expect(result.legs[0].ev).toBeGreaterThan(0);
    expect(result.legs[0].ev).toBeLessThan(0.15);
  });
});
