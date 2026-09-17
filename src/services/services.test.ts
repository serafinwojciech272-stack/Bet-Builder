import { describe, it, expect } from 'vitest';
import { findCorrelatedGroups, correlateWarningsFor, getDataset, analyzeSelectionDeterministic } from './services';
import { buildSelection } from '../data/demoData';

describe('correlation detection', () => {
  it('detects shared correlation group', () => {
    const a = buildSelection('a', 'm', 'e', 'A', 'A', 1.7, { correlationGroup: 'g1' });
    const b = buildSelection('b', 'm', 'e', 'B', 'B', 1.65, { correlationGroup: 'g1' });
    const c = buildSelection('c', 'm', 'e', 'C', 'C', 2, { correlationGroup: 'g2' });
    const groups = findCorrelatedGroups([a, b, c]);
    expect(groups).toHaveLength(1);
    expect(groups[0].sort()).toEqual(['a', 'b']);
    const warnings = correlateWarningsFor([a, b, c]);
    expect(warnings.length).toBe(1);
  });
  it('returns empty for independent', () => {
    const a = buildSelection('a', 'm', 'e', 'A', 'A', 1.7, { correlationGroup: 'g1' });
    const b = buildSelection('b', 'm', 'e', 'B', 'B', 1.7, { correlationGroup: 'g2' });
    expect(findCorrelatedGroups([a, b])).toHaveLength(0);
  });
});

describe('seed dataset', () => {
  it('is deterministic and well-formed', () => {
    const ds = getDataset();
    expect(ds.events.length).toBeGreaterThan(0);
    expect(ds.selections.length).toBeGreaterThan(0);
    for (const s of ds.selections) {
      expect(s.odds).toBeGreaterThan(1);
      expect(s.probability).toBeGreaterThan(0);
      expect(s.probability).toBeLessThanOrEqual(1);
    }
    // histories exist for all selections
    for (const s of ds.selections) {
      expect(ds.histories[s.id]?.length).toBeGreaterThan(0);
    }
  });
});

describe('mock analysis', () => {
  it('produces a deterministic AnalysisResponse', () => {
    const ds = getDataset();
    const s = ds.selections[0];
    const a1 = analyzeSelectionDeterministic(s);
    const a2 = analyzeSelectionDeterministic(s);
    expect(a1.probability).toBe(a2.probability);
    expect(a1.ev).toBeCloseTo(s.ev);
    expect(a1.explanation.length).toBeGreaterThan(0);
  });
});
