import type { OptimizationResult, DecisionGateInput } from './types';
import type { DecisionCenterResult } from './decisionCenter';

export interface DecisionPacketSelection {
  id: string;
  eventId: string;
  marketId?: string;
  odds: number;
  probability: number;
  confidence: number;
  risk: string;
  correlationGroup: string;
}

export interface DecisionPacket {
  id: string;
  version: '1.0';
  createdAt: string;
  status: DecisionGateInput['status'];
  blockers: string[];
  warnings: string[];
  trace: string[];
  source: {
    selectionIds: string[];
    combinedOdds: number;
    baseProbability: number;
    adjustedProbability: number;
    ev: number;
    confidence: number;
    quality: number;
    dependencyMultiplier: number;
    correlationRisk: number;
    concentrationRisk: number;
  };
  selections: DecisionPacketSelection[];
  coreOptimization: OptimizationResult | null;
  mission: {
    eligible: boolean;
    reason: string;
  };
}

export function createDecisionPacket(
  decision: DecisionCenterResult,
  selections: DecisionPacketSelection[],
  optimization: OptimizationResult | null = null,
  now = new Date(),
): DecisionPacket {
  const status = decision.status;
  const blockers = [...decision.blockers];
  const warnings = [...decision.warnings];
  const trace = [...decision.trace];
  if (optimization) trace.push(`Core Engine optimization: ${optimization.selections.length} selected, ${optimization.rejectedSelections.length} rejected.`);
  trace.push(`Decision Packet status: ${status}.`);

  return {
    id: `DP-${now.getTime()}-${selections.map((s) => s.id).join('-').slice(0, 48)}`,
    version: '1.0',
    createdAt: now.toISOString(),
    status,
    blockers,
    warnings,
    trace,
    source: {
      selectionIds: selections.map((s) => s.id),
      combinedOdds: decision.combinedOdds,
      baseProbability: decision.baseProbability,
      adjustedProbability: decision.adjustedProbability,
      ev: decision.ev,
      confidence: decision.confidence,
      quality: decision.quality,
      dependencyMultiplier: decision.dependencyMultiplier,
      correlationRisk: decision.correlationRisk,
      concentrationRisk: decision.concentrationRisk,
    },
    selections,
    coreOptimization: optimization,
    mission: {
      eligible: status !== 'BLOCKED',
      reason: status === 'BLOCKED'
        ? `Blocked by Decision Center: ${blockers.join('; ')}`
        : status === 'CAUTION'
          ? `Mission eligible with ${warnings.length} Decision Center warning(s) preserved.`
          : 'Decision Center READY — mission may enter the existing approval pipeline.',
    },
  };
}

export function assertMissionEligible(packet: DecisionPacket): void {
  if (!packet.mission.eligible || packet.status === 'BLOCKED') {
    throw new Error(`DECISION_PACKET_BLOCKED: ${packet.blockers.join('; ') || 'Decision Packet is blocked.'}`);
  }
}


import type { AnalysisResponse } from '../ai/contracts';
import { evaluateDecisionCenter } from './decisionCenter';

export function createDecisionPacketFromAnalysis(
  analysis: AnalysisResponse,
  now = new Date(),
): DecisionPacket {
  const candidates = analysis.quantDecision?.candidates ?? analysis.valueSignals.map((signal) => ({
    id: signal.selectionId,
    eventId: analysis.eventId,
    marketId: analysis.context.market,
    odds: signal.bestPrice.value,
    probability: analysis.probabilityEstimates.find((p) => p.selectionId === signal.selectionId)?.modelProbability.value ?? 0,
    qualityScore: analysis.dataQuality.score.value,
    correlationGroup: 'event:' + analysis.eventId,
  }));
  const marketSignals = analysis.quantDecision?.marketSignals ?? [];
  const selections = candidates.map((candidate): DecisionPacketSelection => {
    const signal = marketSignals.find((s) => s.selectionId === candidate.id);
    return {
      id: candidate.id,
      eventId: candidate.eventId,
      marketId: candidate.marketId,
      odds: candidate.odds,
      probability: candidate.probability,
      confidence: signal?.confidence ?? analysis.confidence.score.value,
      risk: analysis.riskAssessment.level,
      correlationGroup: candidate.correlationGroup ?? ('event:' + candidate.eventId),
    };
  });
  const decision = evaluateDecisionCenter(selections.map((s) => ({
    id: s.id,
    marketId: s.marketId ?? analysis.context.market,
    eventId: s.eventId,
    name: s.id,
    shortName: s.id,
    odds: s.odds,
    probability: s.probability,
    impliedProbability: 1 / s.odds,
    value: s.probability - 1 / s.odds,
    ev: s.probability * s.odds - 1,
    confidence: s.confidence,
    risk: s.risk as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    correlationGroup: s.correlationGroup,
  })));
  const quantOptimization = analysis.quantDecision?.coreOptimization;
  const optimization = quantOptimization ? {
    selections: [...quantOptimization.selected],
    rejectedSelections: [...quantOptimization.rejected],
    rejectedReasons: Object.fromEntries(quantOptimization.rejected.map((id) => [id, 'Rejected by quant decision engine.'])),
    stake: 0,
    combinedOdds: quantOptimization.combinedOdds,
    estimatedProbability: quantOptimization.estimatedProbability,
    estimatedEv: quantOptimization.estimatedEv,
    potentialReturn: 0,
    potentialProfit: 0,
    diversificationScore: quantOptimization.diversificationScore,
    rationale: quantOptimization.rationale,
  } : null;
  return createDecisionPacket(decision, selections, optimization, now);
}
