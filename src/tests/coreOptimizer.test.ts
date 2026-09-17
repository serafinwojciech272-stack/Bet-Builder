import { describe, expect, it } from 'vitest';
import { createMockCoreEngine } from '../core/mockCoreEngine';

const readyGate = {
  status: 'READY' as const,
  blockers: [],
  warnings: [],
  trace: ['unit-test-ready-gate'],
};

describe('deterministic portfolio optimizer', () => {
  it('keeps the highest-EV selection when a correlation group is capped', () => {
    const engine = createMockCoreEngine();
    const result = engine.optimize({
      stake: 100,
      minEv: 0,
      maxSelections: 3,
      maxPerCorrelationGroup: 1,
      decisionGate: readyGate,
      selections: [
        { id: 'a', odds: 2.2, probability: 0.52, correlationGroup: 'match-1', confidence: 0.9 },
        { id: 'b', odds: 2.1, probability: 0.5, correlationGroup: 'match-1', confidence: 0.9 },
        { id: 'c', odds: 1.8, probability: 0.6, correlationGroup: 'match-2', confidence: 0.8 },
      ],
    });

    expect(result.selections).toContain('a');
    expect(result.selections).not.toContain('b');
    expect(result.rejectedReasons.b).toContain('Correlation group limit');
  });

  it('applies confidence and EV gates with auditable rejection reasons', () => {
    const engine = createMockCoreEngine();
    const result = engine.optimize({
      stake: 50,
      minEv: 0.05,
      minConfidence: 0.8,
      decisionGate: readyGate,
      selections: [
        { id: 'low-ev', odds: 1.5, probability: 0.66, correlationGroup: 'g1', confidence: 0.95 },
        { id: 'low-confidence', odds: 2.4, probability: 0.52, correlationGroup: 'g2', confidence: 0.55 },
        { id: 'good', odds: 2.2, probability: 0.52, correlationGroup: 'g3', confidence: 0.9 },
      ],
    });

    expect(result.selections).toEqual(['good']);
    expect(result.rejectedReasons['low-ev']).toContain('below minimum');
    expect(result.rejectedReasons['low-confidence']).toContain('below minimum');
    expect(result.potentialProfit).toBeGreaterThan(0);
  });
});
