import { describe, expect, it } from 'vitest';
import { InMemoryDecisionMemory } from './decisionMemory';

describe('InMemoryDecisionMemory', () => {
  it('records decisions and calculates CLV only when a closing price is supplied', () => {
    const memory = new InMemoryDecisionMemory();
    memory.record({
      decisionId: 'd1',
      eventId: 'e1',
      generatedAt: '2026-09-17T12:00:00.000Z',
      selections: [{
        selectionId: 'match-winner:home',
        eventId: 'e1',
        oddsAtDecision: 2.2,
        modelProbability: 0.5,
        fairProbabilitySource: 'MODEL',
        selected: true,
      }],
      combinedOdds: 2.2,
      estimatedProbability: 0.5,
      estimatedEv: 0.1,
      dependencyMultiplier: 1,
      coreRationale: 'positive EV',
    });

    const settled = memory.settle('d1', { 'match-winner:home': 1 }, { 'match-winner:home': 2.0 });
    expect(settled?.clv?.['match-winner:home'].positive).toBe(true);
    expect(settled?.settledSelectionOutcomes?.['match-winner:home']).toBe(1);
  });

  it('calibrates model probabilities but excludes market-derived probabilities', () => {
    const memory = new InMemoryDecisionMemory();
    memory.record({
      decisionId: 'model',
      eventId: 'e1',
      generatedAt: new Date().toISOString(),
      selections: [{ selectionId: 's1', eventId: 'e1', oddsAtDecision: 2, modelProbability: 0.8, fairProbabilitySource: 'MODEL', selected: true }],
      combinedOdds: 2,
      estimatedProbability: 0.8,
      estimatedEv: 0.6,
      dependencyMultiplier: 1,
      coreRationale: 'model',
    });
    memory.record({
      decisionId: 'market',
      eventId: 'e2',
      generatedAt: new Date().toISOString(),
      selections: [{ selectionId: 's2', eventId: 'e2', oddsAtDecision: 2, modelProbability: 0.5, fairProbabilitySource: 'DEVIG_CONSENSUS', selected: true }],
      combinedOdds: 2,
      estimatedProbability: 0.5,
      estimatedEv: 0,
      dependencyMultiplier: 1,
      coreRationale: 'market',
    });

    memory.settle('model', { s1: 1 });
    memory.settle('market', { s2: 0 });
    const report = memory.calibration();
    expect(report.sampleSize).toBe(1);
    expect(report.brierScore).toBeCloseTo(0.04, 8);
  });
});
