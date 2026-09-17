import { describe, expect, it } from 'vitest';
import type { OddsSnapshot } from '../domain/types';
import { marketEfficiency, movementSignal, summarizeQuotes } from './quant';

const quote = (id: string, selectionId: string, bookmaker: string, odds: number): OddsSnapshot => ({
  id,
  eventId: 'event-1',
  market: 'match-winner',
  bookmaker,
  capturedAt: new Date().toISOString(),
  quotes: [{ selectionId, label: selectionId, decimalOdds: odds }],
  feedLatencyMs: 100,
  provider: 'test',
});

describe('quant toolkit', () => {
  it('summarizes best, median and bookmaker dispersion', () => {
    const snapshots = [quote('1', 'home', 'a', 2), quote('2', 'home', 'b', 2.2), quote('3', 'home', 'c', 2.1)];
    const [summary] = summarizeQuotes(snapshots);
    expect(summary.bestOdds).toBe(2.2);
    expect(summary.medianOdds).toBe(2.1);
    expect(summary.bookmakerCount).toBe(3);
  });

  it('normalizes a two-way market and exposes overround', () => {
    const snapshots = [quote('1', 'home', 'a', 1.9), quote('2', 'away', 'a', 1.9)];
    const efficiency = marketEfficiency(snapshots);
    expect(efficiency).not.toBeNull();
    expect(efficiency?.overround).toBeGreaterThan(0);
    expect(efficiency?.normalizedProbabilities.home).toBeCloseTo(0.5, 5);
  });

  it('detects bookmaker movement deterministically', () => {
    const previous = [quote('1', 'home', 'a', 2)];
    const current = [quote('2', 'home', 'a', 2.1)];
    const [movement] = movementSignal(previous, current);
    expect(movement.direction).toBe('UP');
    expect(movement.changePct).toBeCloseTo(5, 5);
  });
});
