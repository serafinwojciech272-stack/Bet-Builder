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
      return selections.map((s) => this.analyzeSelection(s.id, s.odds, s.probability, 0.78));
    },
    optimize(req) {
      const minEv = req.minEv ?? 0;
      const maxSelections = Math.max(1, req.maxSelections ?? req.selections.length || 1);
      const maxPerGroup = Math.max(1, req.maxPerCorrelationGroup ?? 1);
      const minConfidence = Math.max(0, Math.min(1, req.minConfidence ?? 0));
      const rejectedReasons: Record<string, string> = {};

      const valid = req.selections.filter((s) => {
        const ok = Number.isFinite(s.odds) && s.odds > 1 && Number.isFinite(s.probability) && s.probability >= 0 && s.probability <= 1;
        if (!ok) rejectedReasons[s.id] = 'Invalid odds or probability.';
        return ok;
      });

      const ranked = [...valid].sort((a, b) => {
        const evDelta = modelEv(b.probability, b.odds) - modelEv(a.probability, a.odds);
        if (Math.abs(evDelta) > 1e-9) return evDelta;
        return (b.confidence ?? 0.5) - (a.confidence ?? 0.5);
      });

      const kept: typeof ranked = [];
      const groupCounts = new Map<string, number>();
      for (const selection of ranked) {
        const ev = modelEv(selection.probability, selection.odds);
        const confidence = selection.confidence ?? 0.5;
        if (ev < minEv) {
          rejectedReasons[selection.id] = `EV ${(ev * 100).toFixed(2)}% below minimum ${(minEv * 100).toFixed(2)}%.`;
          continue;
        }
        if (confidence < minConfidence) {
          rejectedReasons[selection.id] = `Confidence ${(confidence * 100).toFixed(0)}% below minimum ${(minConfidence * 100).toFixed(0)}%.`;
          continue;
        }
        const count = groupCounts.get(selection.correlationGroup) ?? 0;
        if (count >= maxPerGroup) {
          rejectedReasons[selection.id] = `Correlation group limit (${maxPerGroup}) reached.`;
          continue;
        }
        if (kept.length >= maxSelections) {
          rejectedReasons[selection.id] = `Portfolio size limit (${maxSelections}) reached.`;
          continue;
        }
        kept.push(selection);
        groupCounts.set(selection.correlationGroup, count + 1);
      }

      const selected = kept.length > 0 ? kept : valid.slice(0, maxSelections);
      const selectedIds = new Set(selected.map((s) => s.id));
      for (const selection of valid) {
        if (!selectedIds.has(selection.id) && !rejectedReasons[selection.id]) {
          rejectedReasons[selection.id] = 'Not selected after portfolio constraints.';
        }
      }

      const odds = selected.map((s) => s.odds);
      const combined = combinedOdds(odds);
      const probability = jointModelProbability(selected.map((s) => s.probability));
      const ev = probability * combined - 1;
      const stake = Number.isFinite(req.stake) && req.stake >= 0 ? req.stake : 0;
      const groups = new Set(selected.map((s) => s.correlationGroup)).size;
      const diversificationScore = selected.length <= 1 ? 0 : Math.min(1, groups / selected.length);
      const rejectedSelections = Object.keys(rejectedReasons);
      const rationale = rejectedSelections.length > 0
        ? `${rejectedSelections.length} selection(s) were filtered by EV, confidence, correlation, or portfolio-size constraints. ${groups} independent correlation group(s) remain.`
        : `Portfolio accepted with ${groups} independent correlation group(s) and ${(diversificationScore * 100).toFixed(0)}% diversification score.`;

      return {
        selections: selected.map((s) => s.id),
        rejectedSelections,
        rejectedReasons,
        stake,
        combinedOdds: combined,
        estimatedProbability: probability,
        estimatedEv: ev,
        potentialReturn: potentialReturn(stake, combined),
        potentialProfit: potentialProfit(stake, combined),
        diversificationScore,
        rationale,
      };
    },
  };
}
