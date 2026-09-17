import { describe, expect, it } from 'vitest';
import type { OddsSnapshot } from '../domain/types';
import { marketEfficiency, movementSignal, summarizeQuotes } from './quant';
import { analyzeDependencies } from './dependency';
import { optimizePortfolio } from './portfolio';
import { detectSteam, summarizeMovement } from './movement';

const quote = (id: string, selectionId: string, bookmaker: string, odds: number): OddsSnapshot => ({ id, eventId: 'event-1', market: 'match-winner', bookmaker, capturedAt: new Date().toISOString(), quotes: [{ selectionId, label: selectionId, decimalOdds: odds }], feedLatencyMs: 100, provider: 'test' });

describe('quant toolkit', () => {
  it('summarizes best, median and bookmaker dispersion', () => { const [summary] = summarizeQuotes([quote('1', 'home', 'a', 2), quote('2', 'home', 'b', 2.2), quote('3', 'home', 'c', 2.1)]); expect(summary.bestOdds).toBe(2.2); expect(summary.medianOdds).toBe(2.1); expect(summary.bookmakerCount).toBe(3); });
  it('normalizes a two-way market and exposes overround', () => { const efficiency = marketEfficiency([quote('1', 'home', 'a', 1.9), quote('2', 'away', 'a', 1.9)]); expect(efficiency).not.toBeNull(); expect(efficiency?.overround).toBeGreaterThan(0); expect(efficiency?.normalizedProbabilities.home).toBeCloseTo(0.5, 5); });
  it('detects bookmaker movement deterministically', () => { const [movement] = movementSignal([quote('1', 'home', 'a', 2)], [quote('2', 'home', 'a', 2.1)]); expect(movement.direction).toBe('UP'); expect(movement.changePct).toBeCloseTo(5, 5); });
  it('detects same-event dependencies', () => { const result = analyzeDependencies([{ id: 'a', eventId: 'e1', correlationGroup: 'team-a' }, { id: 'b', eventId: 'e1', correlationGroup: 'team-a' }, { id: 'c', eventId: 'e2', correlationGroup: 'team-c' }]); expect(result.pairs).toHaveLength(3); expect(result.conflicts).toHaveLength(1); expect(result.adjustedJointProbabilityMultiplier).toBeLessThan(1); });
  it('optimizes a constrained portfolio and explains rejects', () => { const result = optimizePortfolio([{ id: 'a', eventId: 'e1', odds: 2, probability: 0.55, ev: 0.1, qualityScore: 90, correlationGroup: 'a' }, { id: 'b', eventId: 'e1', odds: 2, probability: 0.54, ev: 0.08, qualityScore: 88, correlationGroup: 'b' }, { id: 'c', eventId: 'e1', odds: 3, probability: 0.4, ev: 0.2, qualityScore: 85, correlationGroup: 'c' }], { maxSameEvent: 2 }); expect(result.selected).toHaveLength(2); expect(result.rejected.some((item) => item.id === 'c')).toBe(true); });
  it('measures movement velocity and consensus steam', () => { const points = [{ selectionId: 'a', bookmaker: 'x', odds: 2.1, capturedAt: '2026-09-17T10:00:00Z' }, { selectionId: 'a', bookmaker: 'x', odds: 1.9, capturedAt: '2026-09-17T11:00:00Z' }, { selectionId: 'a', bookmaker: 'y', odds: 2, capturedAt: '2026-09-17T10:00:00Z' }, { selectionId: 'a', bookmaker: 'y', odds: 1.85, capturedAt: '2026-09-17T11:00:00Z' }]; const movement = summarizeMovement(points); expect(movement).toHaveLength(2); expect(movement[0].velocityPerHour).toBeLessThan(0); expect(detectSteam(points)[0].direction).toBe('STEAM_DOWN'); });
});
