import type { Selection } from '../domain/types';
import { combinedOdds, modelEv, impliedProbability } from '../analytics/calcs';
import { analyzeDependencies } from '../analytics/dependency';

export type DecisionStatus = 'READY' | 'CAUTION' | 'BLOCKED';

export interface LegDecision {
  selection: Selection;
  implied: number;
  edge: number;
  ev: number;
  quality: number;
  risk: Selection['risk'];
  confidence: number;
}

export interface DecisionCenterResult {
  status: DecisionStatus;
  combinedOdds: number;
  baseProbability: number;
  adjustedProbability: number;
  ev: number;
  dependencyMultiplier: number;
  correlationRisk: number;
  concentrationRisk: number;
  confidence: number;
  quality: number;
  legDecisions: LegDecision[];
  blockers: string[];
  warnings: string[];
  strengths: string[];
  trace: string[];
}

const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));

function qualityOf(s: Selection) {
  const confidence = clamp(s.confidence ?? 0.5);
  const riskPenalty = ({ LOW: 0, MEDIUM: 0.12, HIGH: 0.25, CRITICAL: 0.4 } as Record<Selection['risk'], number>)[s.risk] ?? 0.15;
  return clamp(confidence - riskPenalty + 0.25);
}

export function evaluateDecisionCenter(selections: Selection[]): DecisionCenterResult {
  const empty: DecisionCenterResult = {
    status: 'BLOCKED', combinedOdds: 0, baseProbability: 0, adjustedProbability: 0, ev: 0,
    dependencyMultiplier: 1, correlationRisk: 0, concentrationRisk: 0, confidence: 0, quality: 0,
    legDecisions: [], blockers: ['Add at least one selection to open the decision center.'], warnings: [], strengths: [], trace: ['No portfolio submitted.'],
  };
  if (!selections.length) return empty;

  const deps = analyzeDependencies(selections);
  const legDecisions = selections.map((selection) => ({
    selection,
    implied: impliedProbability(selection.odds),
    edge: selection.probability - impliedProbability(selection.odds),
    ev: modelEv(selection.probability, selection.odds),
    quality: qualityOf(selection),
    risk: selection.risk,
    confidence: clamp(selection.confidence ?? 0.5),
  }));
  const odds = combinedOdds(selections.map((s) => s.odds));
  const baseProbability = selections.reduce((p, s) => p * clamp(s.probability), 1);
  const adjustedProbability = baseProbability * deps.adjustedJointProbabilityMultiplier;
  const ev = adjustedProbability * odds - 1;
  const groupCounts = new Map<string, number>();
  for (const s of selections) if (s.correlationGroup) groupCounts.set(s.correlationGroup, (groupCounts.get(s.correlationGroup) ?? 0) + 1);
  const maxGroup = Math.max(1, ...groupCounts.values());
  const concentrationRisk = clamp(maxGroup / selections.length);
  const correlationRisk = clamp(deps.correlationPenalty);
  const confidence = clamp(legDecisions.reduce((sum, l) => sum + l.confidence, 0) / legDecisions.length * (1 - correlationRisk * 0.5));
  const quality = clamp(legDecisions.reduce((sum, l) => sum + l.quality, 0) / legDecisions.length * (1 - correlationRisk * 0.35));

  const blockers: string[] = [...deps.conflicts];
  const warnings: string[] = [];
  const strengths: string[] = [];
  if (ev < 0) warnings.push('Portfolio EV is negative under the current model snapshot.');
  if (correlationRisk >= 0.2) warnings.push(`Structural dependency penalty is ${(correlationRisk * 100).toFixed(0)}%.`);
  if (concentrationRisk >= 0.67 && selections.length > 1) warnings.push('Portfolio is concentrated in one correlation group.');
  if (confidence < 0.6) warnings.push('Model confidence is below the review threshold.');
  if (quality >= 0.75) strengths.push('Data/model quality is above the internal review threshold.');
  if (legDecisions.some((l) => l.edge > 0.03)) strengths.push('At least one leg shows a positive model-to-implied probability gap.');
  if (correlationRisk < 0.08) strengths.push('Low structural dependency across the submitted portfolio.');

  let status: DecisionStatus = 'READY';
  if (blockers.length) status = 'BLOCKED';
  else if (ev < 0 || confidence < 0.6 || correlationRisk >= 0.2) status = 'CAUTION';

  const trace = [
    `Portfolio: ${selections.length} leg(s), combined odds ${odds.toFixed(2)}.`,
    `Joint probability: ${(baseProbability * 100).toFixed(1)}% base → ${(adjustedProbability * 100).toFixed(1)}% dependency-adjusted.`,
    `Dependency multiplier: ${deps.adjustedJointProbabilityMultiplier.toFixed(3)}.`,
    `Confidence ${(confidence * 100).toFixed(0)}% · quality ${(quality * 100).toFixed(0)}% · EV ${(ev * 100).toFixed(1)}%.`,
    `Decision state: ${status}.`,
  ];

  return { status, combinedOdds: odds, baseProbability, adjustedProbability, ev, dependencyMultiplier: deps.adjustedJointProbabilityMultiplier, correlationRisk, concentrationRisk, confidence, quality, legDecisions, blockers, warnings, strengths, trace };
}
