import type { Selection } from '../domain/types';
import { impliedProbability, modelEv, valueOver, riskForOdds, oddsMovement } from '../analytics/calcs';
import { createSeedDataset, type DemoDataset } from '../data/seed';
import { createMockCoreEngine } from '../core/mockCoreEngine';

let dataset: DemoDataset | null = null;

export function getDataset(): DemoDataset {
  if (!dataset) dataset = createSeedDataset();
  return dataset;
}

export function getSelectionById(id: string): Selection | undefined {
  return getDataset().selections.find((s) => s.id === id);
}

const engine = createMockCoreEngine();

export function analyzeSelectionDeterministic(selection: Selection) {
  return engine.analyzeSelection(selection.id, selection.odds, selection.probability, selection.confidence);
}

export interface CorrelationGroup {
  group: string;
  external: boolean;
}

export function findCorrelatedGroups(selections: Selection[]): string[][] {
  const byGroup = new Map<string, Selection[]>();
  for (const s of selections) {
    const arr = byGroup.get(s.correlationGroup) ?? [];
    arr.push(s);
    byGroup.set(s.correlationGroup, arr);
  }
  return [...byGroup.values()].filter((g) => g.length > 1).map((g) => g.map((s) => s.id));
}

export function correlateWarningsFor(selections: Selection[]): string[] {
  const groups = findCorrelatedGroups(selections);
  const warnings: string[] = [];
  for (const g of groups) {
    warnings.push(`Selections ${g.join(', ')} are correlated (shared market factor).`);
  }
  return warnings;
}

export { impliedProbability, modelEv, valueOver, riskForOdds, oddsMovement };
