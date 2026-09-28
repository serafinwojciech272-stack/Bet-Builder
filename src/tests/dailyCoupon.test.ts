import { describe, expect, it } from 'vitest';
import { buildDailyCoupon } from '../core/dailyCoupon';
import type { OddsSnapshot, SportEvent } from '../domain/types';

const event = (id: string, startTime: string, status: SportEvent['status'] = 'scheduled'): SportEvent => ({
  id, sportKey: 'soccer', league: { id: 'pl', name: 'Test League', sportKey: 'soccer', country: 'PL' },
  homeTeam: { id: id+'h', name: 'Home '+id, shortName: 'Home '+id, rating: .5, form: [], injuriesOut: 0 },
  awayTeam: { id: id+'a', name: 'Away '+id, shortName: 'Away '+id, rating: .5, form: [], injuriesOut: 0 },
  startTime, status, venue: '', monitored: true, liquidity: .8,
});
const snap = (eventId: string, bookmaker: string, odds: number): OddsSnapshot => ({
  id: eventId+bookmaker, eventId, market: 'match-winner', bookmaker, capturedAt: '2026-09-28T08:00:00Z', feedLatencyMs: 1000,
  provider: 'test', quotes: [{ selectionId: eventId+':home', label: 'Home', decimalOdds: odds }, { selectionId: eventId+':away', label: 'Away', decimalOdds: 2.2 }],
});

describe('daily bookmaker coupon planner', () => {
  it('filters by Warsaw day and requested bookmakers', () => {
    const result = buildDailyCoupon({
      date: '2026-09-28',
      events: [event('a','2026-09-28T18:00:00Z'), event('b','2026-09-29T18:00:00Z')],
      snapshots: [snap('a','STS',2.0), snap('a','Superbet',2.1), snap('b','STS',3)],
      bookmakers: ['STS','Superbet'], stake: 20, maxLegs: 5,
    });
    expect(result.eligibleEvents).toBe(1);
    expect(result.bookmakersFound).toEqual(expect.arrayContaining(['STS','Superbet']));
    expect(result.legs.length).toBeGreaterThan(0);
    expect(result.combinedOdds).toBeGreaterThan(1);
    expect(result.potentialReturn).toBeGreaterThan(0);
  });
  it('blocks when requested bookmakers are absent', () => {
    const result = buildDailyCoupon({
      date: '2026-09-28', events: [event('a','2026-09-28T18:00:00Z')],
      snapshots: [snap('a','OtherBook',2)], bookmakers: ['STS','Superbet'], stake: 10,
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.blockers.join(' ')).toMatch(/bukmacherzy/i);
  });
});
