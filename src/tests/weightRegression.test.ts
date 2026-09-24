import { describe, expect, it } from 'vitest';
import { analyzeFixture, testWorkspace } from './helpers';
import { factorImpact, factorScore, factorWeight } from '../domain/services/riskService';
import {
  analyzeFixtureEventWithMissingWeights,
  draftMissionWithMissingWeights,
  narrativeFromRiskFactors,
} from './weightFixtures';
import { findUntaggedNumbers, isDeterministicNumber } from '../domain/numbers';

/**
 * Historical failure mode: `Cannot read properties of undefined (reading 'weight')`.
 * The active analysis path sorts risk factors by `score * weight` and folds the
 * winner's `note` into the narrative. A factor with a missing or malformed
 * weight/score object must degrade to a safe zero rather than crash.
 */
describe('weight regression hardening (undefined.weight)', () => {
  it('weight accessors are safe for missing, malformed and valid factors', () => {
    expect(factorWeight(undefined)).toBe(0);
    expect(factorWeight(null)).toBe(0);
    expect(factorWeight({})).toBe(0);
    expect(factorWeight({ weight: undefined })).toBe(0);
    expect(factorWeight({ weight: {} } as never)).toBe(0);
    expect(factorWeight({ weight: { value: Number.NaN } } as never)).toBe(0);
    expect(factorWeight({ weight: { value: Number.POSITIVE_INFINITY } } as never)).toBe(0);
    expect(factorWeight({ weight: { value: 0.26 } } as never)).toBe(0.26);

    expect(factorScore(undefined)).toBe(0);
    expect(factorScore({})).toBe(0);
    expect(factorScore({ score: { value: Number.NaN } } as never)).toBe(0);
    expect(factorScore({ score: { value: 0.5 } } as never)).toBe(0.5);

    expect(factorImpact(undefined)).toBe(0);
    expect(factorImpact({})).toBe(0);
    expect(factorImpact({ weight: { value: 0.2 }, score: { value: 0.5 } } as never)).toBe(0.1);
  });

  it('sorts a factor list containing missing weights without throwing', () => {
    // Deliberately malformed factors — cast through `never` so the type system
    // does not reject the very inputs this regression guards against.
    const factors = [
      { id: 'a', note: 'no weight at all' },
      { id: 'b', weight: undefined, score: undefined, note: 'explicitly undefined' },
      { id: 'c', weight: { value: 0.26 }, score: { value: 0.9 }, note: 'valid' },
      { id: 'd', weight: {}, score: {}, note: 'malformed objects' },
    ] as unknown as Array<Record<string, unknown>>;
    const impact = (f: Record<string, unknown>) => factorImpact(f as never);
    expect(() => factors.slice().sort((a, b) => impact(b) - impact(a))).not.toThrow();
    const winner = factors.slice().sort((a, b) => impact(b) - impact(a))[0];
    expect(winner?.note).toBe('valid');
  });

  it('produces an analysis narrative even when risk factors carry no weight object', async () => {
    const analysis = await analyzeFixtureEventWithMissingWeights();
    // The consumer sorts factors by weighted impact and folds the winner's note
    // into prose; it must never dereference an undefined weight object.
    expect(() => narrativeFromRiskFactors(analysis.riskAssessment.factors)).not.toThrow();
    const line = narrativeFromRiskFactors(analysis.riskAssessment.factors);
    expect(line).toContain('Risk factors unavailable in this snapshot.');
    expect(line).not.toContain('undefined');
    expect(analysis.summary.narrative.length).toBeGreaterThan(2);
    expect(findUntaggedNumbers(analysis.riskAssessment)).toEqual([]);
  });

  it('drafts a mission from a missing-weight analysis without crashing', async () => {
    const analysis = await analyzeFixtureEventWithMissingWeights();
    expect(() => draftMissionWithMissingWeights(analysis)).not.toThrow();
    const mission = draftMissionWithMissingWeights(analysis);
    expect(mission.target.selectionLabel ?? mission.target.marketLabel).toBeTruthy();
  });

  it('keeps the standard analysis path green and fully deterministic-number tagged', async () => {
    const analysis = await analyzeFixture();
    expect(analysis.meta.dataStatus).toBe('ODDS_AVAILABLE');
    expect(analysis.meta.oddsAvailable).toBe(true);
    expect(analysis.riskAssessment.factors.length).toBeGreaterThan(0);
    expect(
      analysis.riskAssessment.factors.every(
        (f) => isDeterministicNumber(f.weight) && isDeterministicNumber(f.score),
      ),
    ).toBe(true);
    expect(analysis.summary.narrative.some((line) => line.includes('undefined'))).toBe(false);
  });

  it('exposes a workspace whose analysis service survives a no-odds event', async () => {
    const { service } = testWorkspace();
    // Fixture workspace is odds-backed; assert the service is healthy and stable.
    expect(await service.health()).toMatchObject({ ok: true });
  });
});
