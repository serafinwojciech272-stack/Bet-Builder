import { describe, expect, it } from 'vitest';
import { InMemoryAnalysisRepository } from '../ai/AnalysisRepository';
import { MockSportsDataRepository } from '../domain/repositories';
import { MockAIAnalysisService } from '../ai/MockAIAnalysisService';
import { measure } from '../domain/services/measurementService';
import { createWorkspace } from '../state/services';
import { seedWorkspace } from '../state/seed';

async function historicalRepo() {
  const dataRepo = new MockSportsDataRepository({ latencyMs: 0 });
  const repo = new InMemoryAnalysisRepository();
  const past = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const older = new MockAIAnalysisService(dataRepo, { latencyMs: 0, now: () => past });
  const current = new MockAIAnalysisService(dataRepo, { latencyMs: 0 });

  const a1 = await older.analyzeEvent({ eventId: 'EVT-SOC-1001', requestedBy: 'vitest' });
  const a2 = await current.analyzeEvent({ eventId: 'EVT-SOC-1001', requestedBy: 'vitest' });
  const a3 = await current.analyzeEvent({ eventId: 'EVT-BAS-2002', requestedBy: 'vitest' });
  await repo.save(a1);
  await repo.save(a2);
  await repo.save(a3);
  return { repo, a1, a2, a3 };
}

describe('analysis history', () => {
  it('stores analyses and returns them newest first', async () => {
    const { repo, a1 } = await historicalRepo();
    expect(await repo.count()).toBe(3);
    const all = await repo.list();
    expect(all).toHaveLength(3);
    expect(all.at(-1)?.id).toBe(a1.analysisId);
    expect(all.map((r) => r.analysis.generatedAt)).toEqual(
      [...all].map((r) => r.analysis.generatedAt).sort((x, y) => y.localeCompare(x)),
    );
    expect(await repo.list({ limit: 2 })).toHaveLength(2);
  });

  it('filters by event and resolves the latest analysis for an event', async () => {
    const { repo, a2 } = await historicalRepo();
    const forEvent = await repo.list({ eventId: 'EVT-SOC-1001' });
    expect(forEvent).toHaveLength(2);
    const latest = await repo.latestForEvent('EVT-SOC-1001');
    expect(latest?.id).toBe(a2.analysisId);
  });

  it('attaches a measured historical outcome and exposes it for filtering', async () => {
    const { repo, a1 } = await historicalRepo();
    const estimate = a1.probabilityEstimates[0];
    const measurement = measure({
      modelProbability: estimate.modelProbability.value,
      impliedProbabilityAtAnalysis: estimate.impliedProbability.value,
      impliedProbabilityAtClose: estimate.impliedProbability.value * 1.08,
      outcome: 1,
    });

    const updated = await repo.attachOutcome(a1.analysisId, {
      resolvedAt: new Date().toISOString(),
      selectionId: estimate.selectionId,
      selectionLabel: estimate.label,
      outcome: 1,
      measurement,
      note: 'settled',
    });

    expect(updated?.outcome?.outcome).toBe(1);
    expect(updated?.outcome?.measurement.verdict).toBe('beat-close');
    expect(updated?.outcome?.measurement.brierScore?.value).toBeGreaterThanOrEqual(0);

    const resolved = await repo.list({ resolvedOnly: true });
    expect(resolved).toHaveLength(1);
    expect(resolved[0].id).toBe(a1.analysisId);
    expect(await repo.attachOutcome('missing-id', resolved[0].outcome!)).toBeNull();
  });

  it('supports comparing two analyses of the same event on deterministic figures', async () => {
    const { a1, a2 } = await historicalRepo();
    const confidenceDelta = a2.confidence.score.value - a1.confidence.score.value;
    const qualityDelta = a2.dataQuality.score.value - a1.dataQuality.score.value;
    expect(Number.isFinite(confidenceDelta)).toBe(true);
    expect(Number.isFinite(qualityDelta)).toBe(true);
    expect(a1.meta.deterministicInputsDigest).toBe(a2.meta.deterministicInputsDigest);
    expect(a1.analysisId).not.toBe(a2.analysisId);
  });
});

describe('seeded operating history', () => {
  it('produces missions across the whole lifecycle plus resolved analyses', async () => {
    const workspace = createWorkspace();
    await workspace.dataRepository.loadCanonicalDataset();
    const { analyses, missions } = await seedWorkspace(workspace);

    expect(analyses.length).toBeGreaterThan(4);
    expect(missions.length).toBeGreaterThan(4);

    const statuses = new Set(missions.map((m) => m.status));
    expect(statuses.has('AWAITING_APPROVAL')).toBe(true);
    expect(statuses.has('COMPLETED')).toBe(true);
    expect(statuses.has('CANCELLED')).toBe(true);
    expect(statuses.has('FAILED')).toBe(true);

    const completed = missions.filter((m) => m.status === 'COMPLETED');
    for (const mission of completed) {
      expect(mission.execution).not.toBeNull();
      expect(mission.measurement).not.toBeNull();
      expect(mission.approval.state).toBe('APPROVED');
      expect(mission.learning.lessons.length).toBeGreaterThan(0);
    }

    const failed = missions.find((m) => m.status === 'FAILED');
    expect(failed?.execution?.failureReason).toBeTruthy();

    const resolved = await workspace.analysisRepository.list({ resolvedOnly: true });
    expect(resolved.length).toBeGreaterThan(0);
    expect(resolved.every((r) => r.outcome !== null)).toBe(true);
  });
});
