export type DependencyType = 'INDEPENDENT' | 'SAME_EVENT' | 'SAME_MARKET' | 'MUTUALLY_EXCLUSIVE' | 'POSITIVE_CORRELATION' | 'NEGATIVE_CORRELATION';

export interface DependencySelection { id: string; eventId: string; marketId?: string; correlationGroup?: string; label?: string; }
export interface DependencyPair { a: string; b: string; type: DependencyType; score: number; reason: string; }
export interface DependencyMatrix { pairs: DependencyPair[]; conflicts: string[]; concentrationPenalty: number; correlationPenalty: number; adjustedJointProbabilityMultiplier: number; }

function clamp(v: number, min = 0, max = 1): number { return Math.min(max, Math.max(min, v)); }

export function analyzeDependencies(selections: DependencySelection[]): DependencyMatrix {
  const pairs: DependencyPair[] = [];
  const conflicts: string[] = [];
  let penalty = 0;
  for (let i = 0; i < selections.length; i += 1) {
    for (let j = i + 1; j < selections.length; j += 1) {
      const a = selections[i]; const b = selections[j];
      if (a.eventId !== b.eventId) { pairs.push({ a: a.id, b: b.id, type: 'INDEPENDENT', score: 0, reason: 'Different events.' }); continue; }
      if (a.marketId && b.marketId && a.marketId === b.marketId) {
        pairs.push({ a: a.id, b: b.id, type: 'SAME_MARKET', score: 0.8, reason: 'Selections belong to the same market.' });
        penalty += 0.08;
      } else if (a.correlationGroup && b.correlationGroup && a.correlationGroup === b.correlationGroup) {
        pairs.push({ a: a.id, b: b.id, type: 'POSITIVE_CORRELATION', score: 0.65, reason: 'Selections share a correlation group.' });
        penalty += 0.06;
      } else {
        pairs.push({ a: a.id, b: b.id, type: 'SAME_EVENT', score: 0.35, reason: 'Selections share the same event.' });
        penalty += 0.025;
      }
    }
  }
  const groupCounts = new Map<string, number>();
  for (const s of selections) if (s.correlationGroup) groupCounts.set(s.correlationGroup, (groupCounts.get(s.correlationGroup) ?? 0) + 1);
  for (const [group, count] of groupCounts) if (count > 1) conflicts.push(`Correlation group ${group} contains ${count} selections.`);
  const concentrationPenalty = selections.length ? clamp(Math.max(...[...groupCounts.values(), 1]) / selections.length) : 0;
  const correlationPenalty = clamp(penalty);
  return { pairs, conflicts, concentrationPenalty, correlationPenalty, adjustedJointProbabilityMultiplier: 1 - correlationPenalty };
}
