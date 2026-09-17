export type DependencyType = 'INDEPENDENT' | 'SAME_EVENT' | 'SAME_MARKET' | 'MUTUALLY_EXCLUSIVE' | 'POSITIVE_CORRELATION' | 'NEGATIVE_CORRELATION';

export interface DependencySelection { id: string; eventId: string; marketId?: string; correlationGroup?: string; label?: string; }
export interface DependencyPair { a: string; b: string; type: DependencyType; score: number; reason: string; }
export interface DependencyMatrix { pairs: DependencyPair[]; conflicts: string[]; concentrationPenalty: number; correlationPenalty: number; adjustedJointProbabilityMultiplier: number; }

function clamp(v: number, min = 0, max = 1): number { return Math.min(max, Math.max(min, v)); }
function normal(s: string | undefined): string { return (s ?? '').trim().toLowerCase().replace(/[._-]+/g, ' '); }

function outcomeToken(label: string): 'HOME' | 'DRAW' | 'AWAY' | 'YES' | 'NO' | 'OVER' | 'UNDER' | null {
  const value = normal(label);
  if (/^(1|home|home team)$/.test(value)) return 'HOME';
  if (/^(x|draw|tie)$/.test(value)) return 'DRAW';
  if (/^(2|away|away team)$/.test(value)) return 'AWAY';
  if (/^(yes|y)$/.test(value)) return 'YES';
  if (/^(no|n)$/.test(value)) return 'NO';
  if (/\bover\b/.test(value)) return 'OVER';
  if (/\bunder\b/.test(value)) return 'UNDER';
  return null;
}

function mutuallyExclusive(a: DependencySelection, b: DependencySelection): boolean {
  if (a.eventId !== b.eventId || !a.marketId || a.marketId !== b.marketId) return false;
  if (a.id === b.id) return true;
  const la = normal(a.label); const lb = normal(b.label);
  if (la && lb) {
    const ta = outcomeToken(la); const tb = outcomeToken(lb);
    if (ta && tb) {
      if ((ta === 'HOME' || ta === 'DRAW' || ta === 'AWAY') && ta !== tb && (tb === 'HOME' || tb === 'DRAW' || tb === 'AWAY')) return true;
      if ((ta === 'YES' && tb === 'NO') || (ta === 'NO' && tb === 'YES')) return true;
      if ((ta === 'OVER' && tb === 'UNDER') || (ta === 'UNDER' && tb === 'OVER')) return true;
    }
    const opposite = (x: string, y: string, p: string, q: string) => x.includes(p) && y.includes(q) || x.includes(q) && y.includes(p);
    if (opposite(la, lb, 'over', 'under') || opposite(la, lb, 'yes', 'no') || opposite(la, lb, 'home', 'away')) return true;
  }
  return false;
}

export function analyzeDependencies(selections: DependencySelection[]): DependencyMatrix {
  const pairs: DependencyPair[] = [];
  const conflicts: string[] = [];
  let penalty = 0;
  for (let i = 0; i < selections.length; i += 1) {
    for (let j = i + 1; j < selections.length; j += 1) {
      const a = selections[i]; const b = selections[j];
      if (mutuallyExclusive(a, b)) {
        pairs.push({ a: a.id, b: b.id, type: 'MUTUALLY_EXCLUSIVE', score: 1, reason: 'Selections represent incompatible outcomes of the same market.' });
        conflicts.push(`Mutually exclusive selections: ${a.id} and ${b.id}.`);
        continue;
      }
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
