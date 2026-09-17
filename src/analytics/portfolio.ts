import { combinedOdds, jointModelProbability } from './calcs';
import { analyzeDependencies, type DependencySelection } from './dependency';

export interface PortfolioCandidate extends DependencySelection { odds: number; probability: number; ev?: number; qualityScore?: number; }
export interface PortfolioConstraints { maxSelections?: number; maxSameEvent?: number; maxCorrelationGroup?: number; minEv?: number; minQuality?: number; maxCombinedOdds?: number; targetCombinedOdds?: number; targetOddsTolerance?: number; }
export interface PortfolioDecision { selected: PortfolioCandidate[]; rejected: Array<{ id: string; reason: string }>; combinedOdds: number; baseProbability: number; adjustedProbability: number; estimatedEv: number; dependencyMultiplier: number; }
function conflictsWithSelected(candidate: PortfolioCandidate, selected: PortfolioCandidate[]): string | null { const deps = analyzeDependencies([...selected, candidate]); const conflict = deps.pairs.find((pair) => pair.type === 'MUTUALLY_EXCLUSIVE' && (pair.a === candidate.id || pair.b === candidate.id)); return conflict ? `Mutually exclusive with ${conflict.a === candidate.id ? conflict.b : conflict.a}.` : null; }
function evaluateSelectionSet(selected: PortfolioCandidate[], constraints: PortfolioConstraints): PortfolioDecision | null {
  if (!selected.length) return null;
  if (selected.length > (constraints.maxSelections ?? 8)) return null;
  if (selected.some((candidate) => (candidate.ev ?? 0) < (constraints.minEv ?? -Infinity))) return null;
  if (selected.some((candidate) => (candidate.qualityScore ?? 100) < (constraints.minQuality ?? 0))) return null;
  if (selected.some((candidate) => selected.filter((s) => s.eventId === candidate.eventId).length > (constraints.maxSameEvent ?? 2))) return null;
  if (selected.some((candidate) => candidate.correlationGroup && selected.filter((s) => s.correlationGroup === candidate.correlationGroup).length > (constraints.maxCorrelationGroup ?? 2))) return null;
  if (analyzeDependencies(selected).pairs.some((pair) => pair.type === 'MUTUALLY_EXCLUSIVE')) return null;
  const odds = combinedOdds(selected.map((s) => s.odds));
  if (odds > (constraints.maxCombinedOdds ?? Infinity)) return null;
  const deps = analyzeDependencies(selected); const baseProbability = jointModelProbability(selected.map((s) => s.probability)); const adjustedProbability = baseProbability * deps.adjustedJointProbabilityMultiplier;
  return { selected, rejected: [], combinedOdds: odds, baseProbability, adjustedProbability, estimatedEv: adjustedProbability * odds - 1, dependencyMultiplier: deps.adjustedJointProbabilityMultiplier };
}
type TargetBest = { decision: PortfolioDecision; inRange: boolean; distance: number };
function optimizeForTarget(ranked: PortfolioCandidate[], constraints: PortfolioConstraints): PortfolioDecision {
  const target = constraints.targetCombinedOdds!; const tolerance = Math.max(0, constraints.targetOddsTolerance ?? target * 0.10); const pool = ranked.slice(0, 24);
  let best: TargetBest | null = null;
  const visit = (start: number, selected: PortfolioCandidate[]): void => {
    if (selected.length > 0) { const decision = evaluateSelectionSet(selected, constraints); if (decision) { const distance = Math.abs(decision.combinedOdds - target); const inRange = distance <= tolerance; if (!best || (inRange && !best.inRange) || (inRange === best.inRange && (distance < best.distance || (distance === best.distance && decision.estimatedEv > best.decision.estimatedEv)))) best = { decision, inRange, distance }; } }
    if (selected.length >= (constraints.maxSelections ?? 8)) return;
    for (let i = start; i < pool.length; i += 1) visit(i + 1, [...selected, pool[i]]);
  };
  visit(0, []);
  if (best === null) return { selected: [], rejected: ranked.map((candidate) => ({ id: candidate.id, reason: 'No portfolio satisfying target-odds constraints.' })), combinedOdds: 0, baseProbability: 0, adjustedProbability: 0, estimatedEv: 0, dependencyMultiplier: 1 };
  const winning = best as TargetBest;
  const selectedIds = new Set(winning.decision.selected.map((candidate: PortfolioCandidate) => candidate.id));
  const rejected = ranked.filter((candidate) => !selectedIds.has(candidate.id)).map((candidate) => ({ id: candidate.id, reason: `Not selected by target-odds optimizer; target ${target.toFixed(2)} ± ${tolerance.toFixed(2)}.` }));
  return { ...winning.decision, rejected };
}
export function optimizePortfolio(candidates: PortfolioCandidate[], constraints: PortfolioConstraints = {}): PortfolioDecision {
  const maxSelections = constraints.maxSelections ?? 8; const maxSameEvent = constraints.maxSameEvent ?? 2; const maxGroup = constraints.maxCorrelationGroup ?? 2;
  const ranked = [...candidates].filter((candidate) => Number.isFinite(candidate.odds) && candidate.odds > 1 && Number.isFinite(candidate.probability) && candidate.probability >= 0 && candidate.probability <= 1).sort((a, b) => (b.ev ?? 0) - (a.ev ?? 0) || (b.qualityScore ?? 0) - (a.qualityScore ?? 0) || a.id.localeCompare(b.id));
  if (Number.isFinite(constraints.targetCombinedOdds) && constraints.targetCombinedOdds! > 1) return optimizeForTarget(ranked, { ...constraints, maxSelections, maxSameEvent, maxCorrelationGroup: maxGroup });
  const selected: PortfolioCandidate[] = []; const rejected: Array<{ id: string; reason: string }> = [];
  for (const candidate of ranked) {
    if (selected.length >= maxSelections) { rejected.push({ id: candidate.id, reason: 'Maximum selection count reached.' }); continue; }
    if ((candidate.ev ?? 0) < (constraints.minEv ?? -Infinity)) { rejected.push({ id: candidate.id, reason: 'Below minimum EV constraint.' }); continue; }
    if ((candidate.qualityScore ?? 100) < (constraints.minQuality ?? 0)) { rejected.push({ id: candidate.id, reason: 'Below minimum data-quality constraint.' }); continue; }
    if (selected.filter((s) => s.eventId === candidate.eventId).length >= maxSameEvent) { rejected.push({ id: candidate.id, reason: 'Maximum exposure to the same event reached.' }); continue; }
    if (candidate.correlationGroup && selected.filter((s) => s.correlationGroup === candidate.correlationGroup).length >= maxGroup) { rejected.push({ id: candidate.id, reason: 'Maximum correlation-group exposure reached.' }); continue; }
    const dependencyConflict = conflictsWithSelected(candidate, selected); if (dependencyConflict) { rejected.push({ id: candidate.id, reason: dependencyConflict }); continue; }
    const odds = combinedOdds([...selected, candidate].map((s) => s.odds)); if (odds > (constraints.maxCombinedOdds ?? Infinity)) { rejected.push({ id: candidate.id, reason: 'Combined odds limit exceeded.' }); continue; }
    selected.push(candidate);
  }
  const deps = analyzeDependencies(selected); const baseProbability = jointModelProbability(selected.map((s) => s.probability)); const adjustedProbability = baseProbability * deps.adjustedJointProbabilityMultiplier; const odds = combinedOdds(selected.map((s) => s.odds));
  return { selected, rejected, combinedOdds: odds, baseProbability, adjustedProbability, estimatedEv: adjustedProbability * odds - 1, dependencyMultiplier: deps.adjustedJointProbabilityMultiplier };
}
