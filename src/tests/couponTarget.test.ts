import { describe, expect, it } from 'vitest';
import { explainLeg, generateCoupon, legsForSelections, removeCouponLeg, swapCouponLeg } from '../core/couponEngine';
import { predictSelection } from '../core/predictionEngine';
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

  it('every leg carries a plain-language reason and its bookmaker', () => {
    const r = generateCoupon({ events, targetOdds: 10, stake: 20 });
    for (const l of r.legs) {
      expect(l.reason.length).toBeGreaterThan(20);
      expect(l.bookmaker).toBe('x');
    }
  });
});

describe('target precision', () => {
  it('lands within a few percent of the target so payout ≈ stake × target', () => {
    for (const t of [3, 5, 10, 25, 50, 100]) {
      const r = generateCoupon({ events, targetOdds: t, stake: 20, maxLegs: 10 });
      expect(Math.abs(r.targetDeviation)).toBeLessThan(0.07);
      expect(r.potentialReturn).toBeCloseTo(20 * r.combinedOdds, 6);
    }
  });
});

describe('per-leg actions', () => {
  const req = { events, targetOdds: 10, stake: 20, maxLegs: 10 };

  it('swap replaces exactly one event and keeps the coupon near the target', () => {
    const base = generateCoupon(req);
    const out = base.legs[0].eventId;
    const next = swapCouponLeg(req, base, out);
    expect(next.legs).toHaveLength(base.legs.length);
    expect(next.legs.some((l) => l.eventId === out)).toBe(false);
    const kept = base.legs.filter((l) => l.eventId !== out).map((l) => l.eventId);
    expect(next.legs.filter((l) => kept.includes(l.eventId))).toHaveLength(kept.length);
    expect(next.combinedOdds).toBeGreaterThan(10 * 0.7);
    expect(next.combinedOdds).toBeLessThan(10 * 1.3);
  });

  it('remove drops the leg and recomputes payout', () => {
    const base = generateCoupon(req);
    const next = removeCouponLeg(req, base, base.legs[0].eventId);
    expect(next.legs).toHaveLength(base.legs.length - 1);
    expect(next.combinedOdds).toBeCloseTo(base.combinedOdds / base.legs[0].marketOdds, 6);
    expect(next.potentialReturn).toBeCloseTo(20 * next.combinedOdds, 6);
  });

  it('explains value, no-value and single-bookmaker cases differently', () => {
    const s = events[0].markets[0].selections[0];
    const value = explainLeg({ p: { ...predictSelection(s), ev: 0.06, probability: 0.5, marketOdds: 2.12 }, bookmaker: 'STS', books: 3 });
    const none = explainLeg({ p: { ...predictSelection(s), ev: -0.03 }, bookmaker: 'STS', books: 3 });
    const single = explainLeg({ p: predictSelection(s), bookmaker: 'STS', books: 1 });
    expect(value).toMatch(/przewaga \+6\.0%/);
    expect(none).toMatch(/bez przewagi/);
    expect(single).toMatch(/tylko u STS/);
  });
});

describe('hand-picked legs', () => {
  it('keeps the picked legs and fills the rest to the target', () => {
    const picks = [events[3].markets[0].selections[1].id, events[7].markets[0].selections[0].id];
    const r = generateCoupon({ events, targetOdds: 20, stake: 10, lockedSelectionIds: picks });
    for (const id of picks) expect(r.legs.some((l) => l.selectionId === id)).toBe(true);
    expect(r.legs.length).toBeGreaterThan(2);
    expect(Math.abs(r.targetDeviation)).toBeLessThan(0.12);
    expect(new Set(r.legs.map((l) => l.eventId)).size).toBe(r.legs.length);
  });

  it('returns only the picks when they already reach the target', () => {
    const picks = events.slice(0, 4).map((e) => e.markets[0].selections[1].id);
    const product = legsForSelections(events, picks).reduce((o, l) => o * l.marketOdds, 1);
    const r = generateCoupon({ events, targetOdds: product * 0.95, stake: 10, lockedSelectionIds: picks });
    expect(r.legs.map((l) => l.selectionId).sort()).toEqual([...picks].sort());
  });
});
