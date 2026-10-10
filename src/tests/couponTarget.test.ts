import { describe, expect, it } from 'vitest';
import { generateCoupon } from '../core/couponEngine';
import type { EventWithMarkets, Selection } from '../domain/types';

const sel = (id: string, eventId: string, odds: number, probability: number): Selection => ({
  id, marketId: eventId + ':m', eventId, name: id, shortName: id, odds, probability,
  impliedProbability: 1 / odds, value: probability - 1 / odds, ev: probability * odds - 1,
  confidence: 0.7, risk: 'LOW', correlationGroup: eventId, dataFreshness: 1, bookmakerDepth: 3,
});
// 20 events, each with a favourite and an underdog priced ~3% over fair (typical margin)
const events: EventWithMarkets[] = Array.from({ length: 20 }, (_, i) => {
  const id = 'e' + String(i).padStart(2, '0');
  const pFav = 0.45 + (i % 10) * 0.04;
  const m = 0.97;
  return {
    id, sport: 'soccer', league: 'L', competition: 'L', homeTeam: 'H' + i, awayTeam: 'A' + i,
    startTime: `2026-10-10T${String(10 + (i % 10)).padStart(2, '0')}:00:00Z`, status: 'SCHEDULED',
    markets: [{ id: id + ':m', eventId: id, type: 'match-winner', name: 'W', category: 'x', status: 'OPEN',
      selections: [sel(id + ':fav', id, +(m / pFav).toFixed(2), pFav), sel(id + ':dog', id, +(m / (1 - pFav)).toFixed(2), 1 - pFav)] }],
  } as EventWithMarkets;
});

describe('coupon engine honours the target odds', () => {
  it('produces different coupons for x5, x10 and x50, each near its target', () => {
    const results = [5, 10, 50].map((t) => generateCoupon({ events, targetOdds: t, stake: 20, maxLegs: 10 }));
    for (const [i, t] of [5, 10, 50].entries()) {
      expect(results[i].targetReached).toBe(true);
      expect(results[i].combinedOdds).toBeGreaterThanOrEqual(t * 0.8);
      expect(results[i].combinedOdds).toBeLessThanOrEqual(t * 1.2);
    }
    const sig = results.map((r) => r.legs.map((l) => l.selectionId).join());
    expect(new Set(sig).size).toBe(3);
    expect(results[2].legs.length).toBeGreaterThan(results[0].legs.length);
  });

  it('is honest about negative EV in BEST_AVAILABLE mode and empty in VALUE_ONLY mode', () => {
    const best = generateCoupon({ events, targetOdds: 10, stake: 20 });
    expect(best.legs.length).toBeGreaterThan(0);
    expect(best.warnings).toContain('NEGATIVE_EV');
    expect(best.status).toBe('REVIEW');
    const value = generateCoupon({ events, targetOdds: 10, stake: 20, mode: 'VALUE_ONLY' });
    expect(value.status).toBe('BLOCKED');
    expect(value.blockers).toContain('NO_VALUE_SELECTIONS');
  });

  it('excludes events on request so the user can draw an alternative coupon', () => {
    const first = generateCoupon({ events, targetOdds: 10, stake: 20 });
    const second = generateCoupon({ events, targetOdds: 10, stake: 20, excludeEventIds: first.legs.map((l) => l.eventId) });
    expect(second.legs.length).toBeGreaterThan(0);
    expect(second.legs.some((l) => first.legs.some((f) => f.eventId === l.eventId))).toBe(false);
  });
});
