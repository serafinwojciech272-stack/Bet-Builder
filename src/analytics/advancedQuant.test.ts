import { describe, expect, it } from 'vitest';
import type { OddsSnapshot } from '../domain/types';
import { assessEdge, bookmakerEfficiency, calculateCLV, consensusProbabilities, exponentiallyWeightedAverage, quantQuality } from './advancedQuant';

const snapshots: OddsSnapshot[] = [
  { id: 'a', eventId: 'e', market: 'match-winner', bookmaker: 'book-a', capturedAt: '2026-09-17T10:00:00.000Z', quotes: [{ selectionId: 'home', label: 'Home', decimalOdds: 2.1 }, { selectionId: 'away', label: 'Away', decimalOdds: 1.8 }], feedLatencyMs: 100, provider: 'test' },
  { id: 'b', eventId: 'e', market: 'match-winner', bookmaker: 'book-b', capturedAt: '2026-09-17T10:00:00.000Z', quotes: [{ selectionId: 'home', label: 'Home', decimalOdds: 2.2 }, { selectionId: 'away', label: 'Away', decimalOdds: 1.75 }], feedLatencyMs: 120, provider: 'test' },
  { id: 'c', eventId: 'e', market: 'match-winner', bookmaker: 'book-c', capturedAt: '2026-09-17T10:00:00.000Z', quotes: [{ selectionId: 'home', label: 'Home', decimalOdds: 2.05 }, { selectionId: 'away', label: 'Away', decimalOdds: 1.85 }], feedLatencyMs: 90, provider: 'test' },
];

describe('advanced quant', () => {
  it('calculates per-bookmaker overround without mixing books', () => {
    const result = bookmakerEfficiency(snapshots);
    expect(result).toHaveLength(3);
    expect(result[0].selectionCount).toBe(2);
    expect(result[0].overround).toBeGreaterThan(0);
  });

  it('builds a normalized median market consensus', () => {
    const result = consensusProbabilities(snapshots);
    expect(result).toHaveLength(2);
    expect(result.reduce((sum, item) => sum + item.probability, 0)).toBeCloseTo(1, 10);
    expect(result.find((item) => item.selectionId === 'home')?.bookmakerCount).toBe(3);
  });

  it('flags quality from coverage, freshness and agreement', () => {
    const result = quantQuality(snapshots, Date.parse('2026-09-17T10:01:00.000Z'));
    expect(result.score).toBeGreaterThan(0);
    expect(result.coverage).toBeCloseTo(0.6, 10);
    expect(result.reasons).not.toContain('stale quotes');
  });

  it('does not manufacture an edge when fair probability is missing', () => {
    const result = assessEdge('home', 2.2, undefined, snapshots, Date.parse('2026-09-17T10:01:00.000Z'));
    expect(result.usable).toBe(true);
    expect(result.edge).toBe(0);
    expect(result.ev).toBe(0);
    expect(result.kelly).toBe(0);
  });

  it('calculates positive CLV when the decision odds exceed the close', () => {
    const result = calculateCLV(2.2, 2.0);
    expect(result.positive).toBe(true);
    expect(result.oddsClv).toBeCloseTo(0.1, 10);
    expect(result.probabilityClv).toBeGreaterThan(0);
  });

  it('weights recent observations more heavily', () => {
    const result = exponentiallyWeightedAverage([0.4, 0.6, 0.8], 1);
    expect(result).toBeGreaterThan(0.6);
    expect(result).toBeLessThan(0.8);
  });
});
