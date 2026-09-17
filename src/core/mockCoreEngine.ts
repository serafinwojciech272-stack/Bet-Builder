import type { AnalysisResponse, OptimizationRequest, OptimizationResult } from './types';
import { impliedProbability, modelEv, valueOver, riskForOdds } from '../analytics/calcs';

// Deterministic mock Core AI Engine. Replace with HTTP client to Core AI Engine.

export interface MockCoreEngine {
  analyzeSelection(selectionId: string, odds: number, probability: number, confidence: number): AnalysisResponse;
  analyzeBuilder(selections: { id: string; odds: number; probability: number; correlationGroup: string }[]): AnalysisResponse[];
  optimize(req: OptimizationRequest): OptimizationResult;
}

export function createMockCoreEngine(): MockCoreEngine {
  return {
    analyzeSelection(_id, odds, probability, confidence) {
      const implied = impliedProbability(odds);
      const value = valueOver(probability, odds);
      const ev = modelEv(probability, odds);
      const risk = riskForOdds(odds);
      const warnings: string[] = [];
      if (probability > implied) warnings.push('Model probability exceeds market-implied probability.');
      if (risk === 'CRITICAL') warnings.push('High-risk price. Size responsibly.');
      const explanation =
        value > 0.01
          ? 'Model probability is above the current market-implied probability.'
          : value < -0.01
            ? 'Model probability is below the current market-implied probability.'
            : 'Model probability is in line with the market-implied probability.';
      return {
        probability,
        impliedProbability: implied,
        value,
        ev,
        risk,
        confidence,
        explanation,
        factors: ['Recent performance', 'Market price', 'Historical movement', 'Data quality'],
        warnings,
        dataQuality: 'High',
      };
    },
    analyzeBuilder(selections) {
      return selections.map((s) =>
        this.analyzeSelection(s.id, s.odds, s.probability, 0.78),
      );
    },
    optimize(req) {
      // deterministic mock: keep selections with positive EV proxy (prob*odds-1 > 0)
      // We only have ids here; mock engine receives enriched data in real impl.
      // For the mock, return the request unchanged with a stable rationale.
      return {
        selections: req.selections,
        stake: req.stake,
        combinedOdds: 1,
        estimatedEv: 0,
        rationale: 'Mock optimization: selections retained unchanged (deterministic).',
      };
    },
  };
}
