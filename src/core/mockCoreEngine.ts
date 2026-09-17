import type { AnalysisResponse, OptimizationRequest, OptimizationResult } from './types';
import { combinedOdds, impliedProbability, modelEv, potentialProfit, potentialReturn, valueOver, riskForOdds } from '../analytics/calcs';
import { optimizePortfolio } from '../analytics/portfolio';

// Deterministic Core Engine adapter. Mathematical outputs remain deterministic and auditable.
export interface MockCoreEngine {
  analyzeSelection(selectionId: string, odds: number, probability: number, confidence: number): AnalysisResponse;
  analyzeBuilder(selections: { id: string; odds: number; probability: number; correlationGroup: string }[]): AnalysisResponse[];
  optimize(req: OptimizationRequest): OptimizationResult;
}

export class DecisionGateBlockedError extends Error {
  readonly code = 'DECISION_GATE_BLOCKED' as const;
  constructor(readonly blockers: string[]) {
    super(`Core Engine optimization blocked by Decision Gate: ${blockers.join(' | ')}`);
    this.name = 'DecisionGateBlockedError';
  }
}

export function createMockCoreEngine(): MockCoreEngine {
  return {
    analyzeSelection(_id, odds, probability, confidence) {
      const implied = impliedProbability(odds); const value = valueOver(probability, odds); const ev = modelEv(probability, odds); const risk = riskForOdds(odds); const warnings: string[] = [];
      if (probability > implied) warnings.push('Model probability exceeds market-implied probability.');
      if (risk === 'CRITICAL') warnings.push('High-risk price. Size responsibly.');
      return { probability, impliedProbability: implied, value, ev, risk, confidence, explanation: value > 0.01 ? 'Model probability is above the current market-implied probability.' : value < -0.01 ? 'Model probability is below the current market-implied probability.' : 'Model probability is in line with the market-implied probability.', factors: ['Recent performance', 'Market price', 'Historical movement', 'Data quality'], warnings, dataQuality: 'High' };
    },
    analyzeBuilder(selections) { return selections.map((s) => this.analyzeSelection(s.id, s.odds, s.probability, 0.78)); },
    optimize(req) {
      if (req.decisionGate.status === 'BLOCKED') throw new DecisionGateBlockedError(req.decisionGate.blockers);
      const rejectedReasons: Record<string, string> = {};
      const valid = req.selections.filter((s) => { const ok = Number.isFinite(s.odds) && s.odds > 1 && Number.isFinite(s.probability) && s.probability >= 0 && s.probability <= 1; if (!ok) rejectedReasons[s.id] = 'Invalid odds or probability.'; return ok; });
      const candidates = valid.map((s) => ({ id: s.id, eventId: s.eventId ?? s.correlationGroup, marketId: s.marketId, correlationGroup: s.correlationGroup, odds: s.odds, probability: s.probability, ev: modelEv(s.probability, s.odds), qualityScore: s.qualityScore ?? 100, confidence: s.confidence, label: s.id }));
      const optimized = optimizePortfolio(candidates, { maxSelections: req.maxSelections, maxSameEvent: req.maxSameEvent, maxCorrelationGroup: req.maxPerCorrelationGroup, minEv: req.minEv, minQuality: req.minQualityScore, minConfidence: req.minConfidence, maxCombinedOdds: req.maxCombinedOdds, targetCombinedOdds: req.targetCombinedOdds, targetOddsTolerance: req.targetOddsTolerance });
      for (const item of optimized.rejected) rejectedReasons[item.id] = item.reason;
      const selected = optimized.selected; const selectedIds = new Set(selected.map((s) => s.id));
      for (const s of valid) if (!selectedIds.has(s.id) && !rejectedReasons[s.id]) rejectedReasons[s.id] = 'Not selected after quant portfolio constraints.';
      const combined = combinedOdds(selected.map((s) => s.odds)); const probability = selected.length ? optimized.adjustedProbability : 0; const ev = probability * combined - 1;
      const stake = Number.isFinite(req.stake) && req.stake >= 0 ? req.stake : 0; const groups = new Set(selected.map((s) => s.correlationGroup)).size;
      const diversificationScore = selected.length <= 1 ? 0 : Math.min(1, groups / selected.length); const targetNote = req.targetCombinedOdds ? `, target ${req.targetCombinedOdds.toFixed(2)} ± ${(req.targetOddsTolerance ?? req.targetCombinedOdds * 0.1).toFixed(2)}` : '';
      const gateNote = req.decisionGate.status === 'CAUTION' ? ` Decision Gate CAUTION preserved with ${req.decisionGate.warnings.length} warning(s).` : ' Decision Gate READY.';
      return { selections: selected.map((s) => s.id), rejectedSelections: Object.keys(rejectedReasons), rejectedReasons, stake, combinedOdds: combined, estimatedProbability: probability, estimatedEv: ev, potentialReturn: potentialReturn(stake, combined), potentialProfit: potentialProfit(stake, combined), diversificationScore, rationale: `Quant portfolio: ${groups} correlation group(s), dependency multiplier ${(optimized.dependencyMultiplier).toFixed(3)}, ${Object.keys(rejectedReasons).length} rejection(s)${targetNote}.${gateNote}` };
    },
  };
}
