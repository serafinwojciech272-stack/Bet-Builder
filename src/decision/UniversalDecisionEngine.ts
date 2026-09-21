import type { DecisionCenterResult } from '../core/decisionCenter';
import type { OptimizationResult } from '../core/types';

export type DecisionDomain = 'sports' | 'business' | 'operations' | 'marketing' | 'finance' | 'custom';
export type DecisionLayer = 'DATA' | 'INTELLIGENCE' | 'DECISION' | 'HUMAN_GATE' | 'MISSION' | 'MEASUREMENT' | 'LEARNING';

export interface EvidenceSignal {
  id: string;
  label: string;
  value: number;
  source: 'deterministic' | 'market' | 'optimization';
}

export interface UniversalDecisionPacket {
  schemaVersion: '1.0';
  domain: DecisionDomain;
  layers: Array<{ id: DecisionLayer; state: 'READY' | 'REVIEW' | 'BLOCKED' | 'PENDING'; detail: string }>;
  evidence: EvidenceSignal[];
  verdict: DecisionCenterResult['status'];
  approvalRequired: true;
  missionReady: boolean;
  rationale: string[];
}

function stateFor(ok: boolean, review = false): 'READY' | 'REVIEW' | 'BLOCKED' {
  return ok ? (review ? 'REVIEW' : 'READY') : 'BLOCKED';
}

/**
 * Domain-neutral projection of the existing deterministic decision stack.
 * This is deliberately pure: it adds the Universal Decision Engine contract
 * without replacing the proven betting/quant calculations underneath.
 */
export function buildUniversalDecisionPacket(
  result: DecisionCenterResult,
  optimization: OptimizationResult | null,
): UniversalDecisionPacket {
  const dataReady = result.marketQuality.integrity >= 1 && result.marketQuality.freshness >= 0.5;
  const intelligenceReady = result.confidence >= 0.6 && result.quality >= 0.55;
  const decisionReady = result.status === 'READY';
  const missionReady = decisionReady && !result.blockers.length && Boolean(optimization);

  return {
    schemaVersion: '1.0',
    domain: 'sports',
    layers: [
      { id: 'DATA', state: stateFor(dataReady, result.marketQuality.freshness < 0.75), detail: `market integrity ${Math.round(result.marketQuality.integrity * 100)}% · freshness ${Math.round(result.marketQuality.freshness * 100)}%` },
      { id: 'INTELLIGENCE', state: stateFor(intelligenceReady, result.confidence < 0.75), detail: `confidence ${Math.round(result.confidence * 100)}% · quality ${Math.round(result.quality * 100)}%` },
      { id: 'DECISION', state: result.status === 'BLOCKED' ? 'BLOCKED' : result.status === 'CAUTION' ? 'REVIEW' : 'READY', detail: `EV ${(result.ev * 100).toFixed(1)}% · dependency ${result.dependencyMultiplier.toFixed(3)}×` },
      { id: 'HUMAN_GATE', state: result.blockers.length ? 'BLOCKED' : 'READY', detail: 'human approval remains mandatory before execution' },
      { id: 'MISSION', state: missionReady ? 'READY' : result.blockers.length ? 'BLOCKED' : 'PENDING', detail: optimization ? `${optimization.selections.length} optimized selection(s)` : 'awaiting portfolio optimization' },
      { id: 'MEASUREMENT', state: 'PENDING', detail: 'activated after governed execution' },
      { id: 'LEARNING', state: 'PENDING', detail: 'activated after measured outcome' },
    ],
    evidence: [
      { id: 'market-quality', label: 'Market quality', value: result.marketQuality.score, source: 'market' },
      { id: 'confidence', label: 'Model confidence', value: result.confidence, source: 'deterministic' },
      { id: 'quality', label: 'Decision quality', value: result.quality, source: 'deterministic' },
      { id: 'dependency', label: 'Dependency multiplier', value: result.dependencyMultiplier, source: 'deterministic' },
      { id: 'diversification', label: 'Portfolio diversification', value: optimization?.diversificationScore ?? 0, source: 'optimization' },
    ],
    verdict: result.status,
    approvalRequired: true,
    missionReady,
    rationale: [
      'One canonical decision packet connects market data, deterministic intelligence and governed action.',
      result.blockers.length ? `Gate blocked: ${result.blockers[0]}` : result.warnings.length ? `Review required: ${result.warnings[0]}` : 'Evidence chain is internally consistent.',
      'Execution is never implied by model output; the human approval gate remains explicit.',
    ],
  };
}
