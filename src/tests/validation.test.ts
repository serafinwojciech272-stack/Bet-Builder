import { describe, expect, it } from 'vitest';
import { analyzeFixture, testWorkspace } from './helpers';
import { validateAnalysisResponse } from '../ai/validation';
import { det, findUntaggedNumbers, isDeterministicNumber } from '../domain/numbers';
import { AnalysisError } from '../ai/AIAnalysisService';
import type { AnalysisResponse } from '../ai/contracts';

describe('AnalysisResponse contract validation', () => {
  it('accepts a response produced by the mock intelligence engine', async () => {
    const analysis = await analyzeFixture();
    const result = validateAnalysisResponse(analysis);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('populates every contract field', async () => {
    const a = await analyzeFixture();
    expect(a.analysisId).toMatch(/^ANL-/);
    expect(a.eventId).toBe('EVT-SOC-1001');
    expect(Number.isNaN(Date.parse(a.generatedAt))).toBe(false);
    expect(a.summary.narrative.length).toBeGreaterThan(2);
    expect(a.keyFactors.length).toBeGreaterThan(0);
    expect(a.marketObservations.length).toBeGreaterThan(0);
    expect(a.probabilityEstimates.length).toBeGreaterThan(0);
    expect(a.valueSignals.length).toBeGreaterThan(0);
    expect(a.recommendedActions.length).toBeGreaterThan(0);
    expect(a.warnings.length).toBeGreaterThan(0);
    expect(a.assumptions.length).toBeGreaterThan(0);
    expect(a.sourceSnapshots.length).toBeGreaterThan(0);
    expect(a.meta.deterministicInputsDigest).toMatch(/^sha-/);
    expect(a.meta.engineMode).toBe('mock');
  });

  it('marks every numeric value as deterministic with a service id', async () => {
    const a = await analyzeFixture();
    expect(isDeterministicNumber(a.confidence.score)).toBe(true);
    expect(a.confidence.score.provenance).toBe('deterministic');
    for (const est of a.probabilityEstimates) {
      expect(est.modelProbability.serviceId).toBe('probability-service');
      expect(est.origin).toBe('deterministic');
    }
    for (const signal of a.valueSignals) {
      expect(signal.edgePct.serviceId).toBe('value-service');
    }
    expect(findUntaggedNumbers(a.riskAssessment)).toEqual([]);
    expect(findUntaggedNumbers(a.correlationAssessment)).toEqual([]);
  });

  it('separates AI inference from deterministic statements', async () => {
    const a = await analyzeFixture();
    expect(a.summary.origin).toBe('ai-inference');
    expect(a.marketObservations.every((o) => o.origin === 'deterministic')).toBe(true);
    expect(a.assumptions.every((x) => x.origin === 'ai-inference')).toBe(true);
  });

  it('model probabilities sum to ~1 per market', async () => {
    const a = await analyzeFixture();
    const total = a.probabilityEstimates.reduce((s, p) => s + p.modelProbability.value, 0);
    expect(total).toBeGreaterThan(0.94);
    expect(total).toBeLessThan(1.06);
  });

  it('rejects a response carrying a raw (untagged) number', async () => {
    const a = await analyzeFixture();
    const tampered = {
      ...a,
      confidence: { ...a.confidence, score: 0.9 as unknown as typeof a.confidence.score },
    } as AnalysisResponse;
    const result = validateAnalysisResponse(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'untagged-number')).toBe(true);
  });

  it('rejects out-of-range probabilities and empty collections', async () => {
    const a = await analyzeFixture();
    const tampered: AnalysisResponse = {
      ...a,
      sourceSnapshots: [],
      probabilityEstimates: [
        {
          ...a.probabilityEstimates[0],
          modelProbability: det(1.7, 'probability', 'probability-service'),
        },
      ],
    };
    const result = validateAnalysisResponse(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('out-of-range');
    expect(result.errors.map((e) => e.code)).toContain('empty-collection');
  });

  it('fails cleanly for an unknown event', async () => {
    const { service } = testWorkspace();
    await expect(
      service.analyzeEvent({ eventId: 'EVT-DOES-NOT-EXIST', requestedBy: 'vitest' }),
    ).rejects.toBeInstanceOf(AnalysisError);
  });

  it('excludes events dropped by normalization (unsupported sport)', async () => {
    const { service } = testWorkspace();
    await expect(
      service.analyzeEvent({ eventId: 'EVT-UNK-9001', requestedBy: 'vitest' }),
    ).rejects.toMatchObject({ code: 'EVENT_NOT_FOUND' });
  });
});
