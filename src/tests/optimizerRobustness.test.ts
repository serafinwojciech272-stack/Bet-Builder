import { describe, expect, it } from 'vitest';
import { createMockCoreEngine } from '../core/mockCoreEngine';
import { optimizePortfolio } from '../analytics/portfolio';

/**
 * Regression guard for the optimizer path on sparse / non-finite inputs.
 *
 * Event-only providers (TheSportsDB) surface events whose confidence, quality
 * or EV may be missing or non-finite. `?? default` does not catch NaN, so the
 * optimizer previously admitted candidates that should have been filtered and
 * could emit NaN/Infinity stake, return or profit. Non-finite inputs must
 * degrade to an explicit default instead of propagating.
 */

const readyGate = { status: 'READY' as const, blockers: [], warnings: [], trace: ['optimizer-robustness'] };

describe('optimizer non-finite hardening', () => {
  it('does not admit a candidate whose EV is NaN when a minimum EV is set', () => {
    const portfolio = optimizePortfolio(
      [
        { id: 'nan-ev', eventId: 'e1', odds: 2.2, probability: 0.55, ev: NaN, correlationGroup: 'c1' },
        { id: 'good', eventId: 'e2', odds: 2.2, probability: 0.55, ev: 0.2, correlationGroup: 'c2' },
      ],
      { minEv: 0.05 },
    );
    expect(portfolio.selected.map((s) => s.id)).not.toContain('nan-ev');
    expect(portfolio.selected.map((s) => s.id)).toContain('good');
  });

  it('never propagates NaN confidence/quality into optimizer outputs', () => {
    const portfolio = optimizePortfolio(
      [{ id: 'x', eventId: 'e1', odds: 2, probability: 0.5, ev: 0.1, confidence: NaN, qualityScore: NaN, correlationGroup: 'c1' }],
      { minConfidence: 0.9, minQuality: 90 },
    );
    for (const value of [portfolio.combinedOdds, portfolio.baseProbability, portfolio.adjustedProbability, portfolio.estimatedEv, portfolio.dependencyMultiplier]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('treats non-finite constraints as their documented defaults', () => {
    const result = createMockCoreEngine().optimize({
      stake: 50,
      minEv: NaN,
      minConfidence: NaN,
      minQualityScore: NaN,
      decisionGate: readyGate,
      selections: [{ id: 'a', odds: 2.2, probability: 0.55, correlationGroup: 'g1' }],
    });
    expect(result.selections).toContain('a');
  });

  it('keeps every numeric output finite when a portfolio is empty', () => {
    const result = createMockCoreEngine().optimize({ stake: 50, decisionGate: readyGate, selections: [] });
    expect(result.selections).toEqual([]);
    expect(result.combinedOdds).toBe(0);
    expect(result.potentialReturn).toBe(0);
    expect(result.potentialProfit).toBe(0);
    for (const value of [result.combinedOdds, result.estimatedProbability, result.estimatedEv, result.potentialReturn, result.potentialProfit, result.diversificationScore]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('keeps return and profit finite when combined odds overflow', () => {
    const result = createMockCoreEngine().optimize({
      stake: 1e308,
      decisionGate: readyGate,
      selections: [
        { id: 'a', odds: 1e150, probability: 0.99, correlationGroup: 'g1' },
        { id: 'b', odds: 1e150, probability: 0.99, correlationGroup: 'g2' },
      ],
    });
    expect(Number.isFinite(result.potentialReturn)).toBe(true);
    expect(Number.isFinite(result.potentialProfit)).toBe(true);
  });

  it('rejects invalid odds/probability inputs without throwing', () => {
    const result = createMockCoreEngine().optimize({
      stake: 50,
      decisionGate: readyGate,
      selections: [
        { id: 'inf', odds: Infinity, probability: 0.5, correlationGroup: 'g1' },
        { id: 'nanprob', odds: 2, probability: NaN, correlationGroup: 'g2' },
        { id: 'over1', odds: 2, probability: 1.5, correlationGroup: 'g3' },
        { id: 'neg', odds: 2, probability: -0.2, correlationGroup: 'g4' },
      ],
    });
    expect(result.selections).toEqual([]);
    expect(Object.values(result.rejectedReasons)).toEqual(expect.arrayContaining(['Invalid odds or probability.']));
  });

  it('preserves an empty portfolio as zero-valued, not a fabricated stake', () => {
    const portfolio = optimizePortfolio([], {});
    expect(portfolio.selected).toHaveLength(0);
    expect(portfolio.combinedOdds).toBe(0);
    expect(portfolio.estimatedEv).toBe(0);
  });
});