import type { CanonicalDataset } from '../domain/repositories';
import type { CouponResult } from '../core/couponEngine';
import { describe, expect, it } from 'vitest';
import { certifyCoupon, couponDataProvenance, couponFreshness } from '../core/liveCouponCertificationM181M190';

const dataset = {
  events: [{ id: 'e1', sportKey: 'soccer', league: { id: 'l1', name: 'Test League', sportKey: 'soccer' }, homeTeam: { id: 'h', name: 'Home' }, awayTeam: { id: 'a', name: 'Away' }, startTime: '2026-10-06T19:00:00.000Z', status: 'scheduled' }],
  snapshots: [
    { id: 's1', eventId: 'e1', market: 'match-winner', bookmaker: 'book_a', capturedAt: '2026-10-06T18:59:30.000Z', quotes: [{ label: 'Home', decimalOdds: 2.1, selectionId: 'sel1' }, { label: 'Away', decimalOdds: 3.2, selectionId: 'sel2' }], feedLatencyMs: 1000, provider: 'parlay-api' },
    { id: 's2', eventId: 'e1', market: 'match-winner', bookmaker: 'book_b', capturedAt: '2026-10-06T18:59:40.000Z', quotes: [{ label: 'Home', decimalOdds: 2.2, selectionId: 'sel1' }, { label: 'Away', decimalOdds: 3.1, selectionId: 'sel2' }], feedLatencyMs: 1000, provider: 'parlay-api' },
  ],
  issues: [], droppedRecords: 0, normalizedAt: '2026-10-06T18:59:40.000Z', provider: 'parlay-api', mode: 'LIVE',
  bookmakers: ['book_a', 'book_b'],
  providerHealth: { provider: 'parlay-api', state: 'HEALTHY', fetchedAt: '2026-10-06T18:59:40.000Z', ageSeconds: 0, staleAfterSeconds: 120, catalogCount: 1, queriedSports: 1, successfulSports: 1, failedSports: 0, eventCount: 1, snapshotCount: 2, bookmakerCount: 2, warnings: [] },
} as unknown as CanonicalDataset;

const coupon = {
  status: 'READY', targetOdds: 2, combinedOdds: 2.1, stake: 20, potentialReturn: 42, potentialProfit: 22,
  estimatedProbability: .55, estimatedEv: .155, blockers: [], warnings: [], rationale: [],
  legs: [{ eventId: 'e1', selectionId: 'sel1', label: 'Home', league: 'Test League', startTime: '2026-10-06T19:00:00.000Z', marketId: 'e1:match-winner', marketOdds: 2.1, probability: .55, impliedProbability: 1/2.1, value: .155, ev: .155, confidence: .8, risk: 'LOW', correlationGroup: 'e1:match-winner' }],
} as unknown as CouponResult;

describe('M181-M190 live coupon certification', () => {
  it('marks non-demo live data and exposes bookmakers', () => {
    const p = couponDataProvenance(dataset);
    expect(p.realData).toBe(true);
    expect(p.liveOdds).toBe(true);
    expect(p.bookmakerCount).toBe(2);
    expect(p.capturedAt).toBe('2026-10-06T18:59:40.000Z');
  });

  it('computes freshness deterministically', () => {
    const f = couponFreshness(dataset, Date.parse('2026-10-06T19:00:00.000Z'));
    expect(f.band).toBe('FRESH');
    expect(f.ageSeconds).toBe(20);
  });

  it('certifies a fresh multi-bookmaker coupon while preserving the execution gate', () => {
    const c = certifyCoupon(dataset, coupon, Date.parse('2026-10-06T19:00:00.000Z'));
    expect(c.status).toBe('CERTIFIED');
    expect(c.provenance.bookmakerCount).toBe(2);
    expect(c.legs[0].bookmakerCount).toBe(2);
    expect(c.gate.humanApprovalRequired).toBe(true);
    expect(c.gate.executionAllowed).toBe(false);
    expect(c.evidenceHash).toHaveLength(16);
  });

  it('blocks provider-stale state even when snapshot age is fresh', () => {
    const degraded = { ...dataset, providerHealth: { ...dataset.providerHealth, state: 'STALE' } } as unknown as CanonicalDataset;
    const c = certifyCoupon(degraded, coupon, Date.parse('2026-10-06T19:00:00.000Z'));
    expect(c.status).toBe('BLOCKED');
    expect(c.reasons).toContain('PROVIDER_STALE');
  });

  it('blocks future-dated market snapshots', () => {
    const future = { ...dataset, snapshots: dataset.snapshots.map(s => ({ ...s, capturedAt: '2026-10-06T19:05:00.000Z' })) } as unknown as CanonicalDataset;
    const c = certifyCoupon(future, coupon, Date.parse('2026-10-06T19:00:00.000Z'));
    expect(c.status).toBe('BLOCKED');
    expect(c.reasons).toContain('FUTURE_CAPTURE_TIMESTAMP');
  });

  it('blocks stale live data', () => {
    const c = certifyCoupon(dataset, coupon, Date.parse('2026-10-06T19:10:00.000Z'));
    expect(c.status).toBe('BLOCKED');
    expect(c.reasons).toContain('STALE_OR_UNKNOWN_FRESHNESS');
  });

  it('matches bookmaker quotes by selectionId before label', () => {
    const renamed = {
      ...dataset,
      snapshots: dataset.snapshots.map(s => ({
        ...s,
        quotes: s.quotes.map(q => ({ ...q, label: 'Different display label', selectionId: 'sel1' })),
      })),
    } as unknown as CanonicalDataset;
    const c = certifyCoupon(renamed, coupon, Date.parse('2026-10-06T19:00:00.000Z'));
    expect(c.legs[0].bookmakerCount).toBe(2);
    expect(c.provenance.couponBookmakerCount).toBe(2);
    expect(c.provenance.couponBookmakers).toEqual(['book_a', 'book_b']);
  });

  it('uses the best bookmaker price for the certified leg', () => {
    const c = certifyCoupon(dataset, coupon, Date.parse('2026-10-06T19:00:00.000Z'));
    expect(c.legs[0].bestOdds).toBe(2.2);
    expect(c.legs[0].odds).toBe(2.2);
  });

});

