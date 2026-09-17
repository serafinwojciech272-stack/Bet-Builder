import { combinedOdds, jointModelProbability } from './calcs';
import { analyzeDependencies, type DependencySelection } from './dependency';

export interface PortfolioCandidate extends DependencySelection { odds: number; probability: number; ev?: number; qualityScore?: number; }
export interface PortfolioConstraints { maxSelections?: number; maxSameEvent?: number; maxCorrelationGroup?: number; minEv?: number; minQuality?: number; maxCombinedOdds?: number; }
export interface PortfolioDecision { selected: PortfolioCandidate[]; rejected: Array<{ id: string; reason: string }>; combinedOdds: number; baseProbability: number; adjustedProbability: number; estimatedEv: number; dependencyMultiplier: number; }

export function optimizePortfolio(candidates: PortfolioCandidate[], constraints: PortfolioConstraints = {}): PortfolioDecision {
  const maxSelections = constraints.maxSelections ?? 8; const maxSameEvent = constraints.maxSameEvent ?? 2; const maxGroup = constraints.maxCorrelationGroup ?? 2;
  const ranked = [...candidates].sort((a, b) => (b.ev ?? 0) - (a.ev ?? 0) || (b.qualityScore ?? 0) - (a.qualityScore ?? 0));
  const selected: PortfolioCandidate[] = []; const rejected: Array<{ id: string; reason: string }> = [];
  for (const candidate of ranked) {
    if (selected.length >= maxSelections) { rejected.push({ id: candidate.id, reason: 'Maximum selection count reached.' }); continue; }
    if ((candidate.ev ?? 0) < (constraints.minEv ?? -Infinity)) { rejected.push({ id: candidate.id, reason: 'Below minimum EV constraint.' }); continue; }
    if ((candidate.qualityScore ?? 100) < (constraints.minQuality ?? 0)) { rejected.push({ id: candidate.id, reason: 'Below minimum data-quality constraint.' }); continue; }
    if (selected.filter((s) => s.eventId === candidate.eventId).length >= maxSameEvent) { rejected.push({ id: candidate.id, reason: 'Maximum exposure to the same event reached.' }); continue; }
    if (candidate.correlationGroup && selected.filter((s) => s.correlationGroup === candidate.correlationGroup).length >= maxGroup) { rejected.push({ id: candidate.id, reason: 'Maximum correlation-group exposure reached.' }); continue; }
    const test = [...selected, candidate];
    const odds = combinedOdds(test.map((s) => s.odds));
    if (odds > (constraints.maxCombinedOdds ?? Infinity)) { rejected.push({ id: candidate.id, reason: 'Combined odds limit exceeded.' }); continue; }
    selected.push(candidate);
  }
  const deps = analyzeDependencies(selected); const baseProbability = jointModelProbability(selected.map((s) => s.probability)); const adjustedProbability = baseProbability * deps.adjustedJointProbabilityMultiplier; const odds = combinedOdds(selected.map((s) => s.odds));
  return { selected, rejected, combinedOdds: odds, baseProbability, adjustedProbability, estimatedEv: adjustedProbability * odds - 1, dependencyMultiplier: deps.adjustedJointProbabilityMultiplier };
}
