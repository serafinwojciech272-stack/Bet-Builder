import type { AnalysisResponse, OptimizationRequest, OptimizationResult } from './types';
import {
  combinedOdds,
  impliedProbability,
  jointModelProbability,
  modelEv,
  potentialProfit,
  potentialReturn,
  valueOver,
  riskForOdds,
} from '../analytics/calcs';

// Deterministic Core Engine adapter. Replace only the adapter boundary with the real Core AI Engine.
// Mathematical outputs remain deterministic and testable; an LLM must not calculate them.

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
            ? 'Model probability is below the market-implied probability.'
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
      return selections.map((s) => this.analyzeSelection(s.id, s.odds, s.probability, 0.78));
    },
    optimize(req) {
      const minEv = req.minEv ?? 0;
      const valid = req.selections.filter(
        (s) => Number.isFinite(s.odds) && s.odds > 1 && Number.isFinite(s.probability) && s.probability >= 0 && s.probability <= 1,
      );
      const rejected = valid.filter((s) => modelEv(s.probability, s.odds) < minEv);
      const kept = valid.filter((s) => modelEv(s.probability, s.odds) >= minEv);
      const selected = kept.length > 0 ? kept : valid;
      const odds = selected.map((s) => s.odds);
      const combined = combinedOdds(odds);
      const probability = jointModelProbability(selected.map((s) => s.probability));
      const ev = probability * combined - 1;
      const stake = Number.isFinite(req.stake) && req.stake >= 0 ? req.stake : 0;
      const rationale =
        rejected.length > 0
          ? `${rejected.length} selection(s) below the minimum EV threshold were excluded. Remaining selections are retained for deterministic builder evaluation.`
          : 'All valid selections meet the minimum EV threshold.';

      return {
        selections: selected.map((s) => s.id),
        rejectedSelections: rejected.map((s) => s.id),
        stake,
        combinedOdds: combined,
        estimatedProbability: probability,
        estimatedEv: ev,
        potentialReturn: potentialReturn(stake, combined),
        potentialProfit: potentialProfit(stake, combined),
        rationale,
      };
    },
  };
}
