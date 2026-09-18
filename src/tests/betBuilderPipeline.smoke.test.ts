import { describe, expect, it } from 'vitest';
import { analyzeFixture } from './helpers';
import { evaluateDecisionCenter } from '../core/decisionCenter';
import { orchestrateDecision } from '../core/decisionOrchestrator';
import { createDecisionPacket } from '../core/decisionPacket';
import { buildMissionFromAnalysis } from '../missions/missionFactory';
import { InMemoryAnalysisRepository } from '../ai/AnalysisRepository';
import { InMemoryMissionRepository } from '../missions/MissionRepository';
import { MissionService } from '../missions/missionService';
import { MockCoreEngineClient } from '../engine/CoreEngineClient';
import type { Selection } from '../domain/types';
import type { EventResearch } from '../research/types';

const research: EventResearch = {
  researchId: 'SMOKE-RESEARCH',
  eventId: 'EVT-SOC-1001',
  generatedAt: '2026-09-18T00:00:00.000Z',
  queries: [],
  sources: [
    { url: 'https://official.test', title: 'Official', publisher: 'Official', language: 'en', kind: 'official', reliability: 'A', publishedAt: '2026-09-18T00:00:00.000Z', snippet: 'confirmed', matchedTerms: ['lineup'] },
    { url: 'https://local.test', title: 'Local', publisher: 'Local', language: 'de', kind: 'local-media', reliability: 'B', publishedAt: '2026-09-18T00:00:00.000Z', snippet: 'preview', matchedTerms: ['form'] },
    { url: 'https://expert.test', title: 'Expert', publisher: 'Expert', language: 'pl', kind: 'expert', reliability: 'B', publishedAt: '2026-09-18T00:00:00.000Z', snippet: 'tactics', matchedTerms: ['tactics'] },
  ],
  findings: [
    { id: 'F1', category: 'lineup', statement: 'Confirmed lineup', polarity: 'supportive', confidence: 0.9, sourceIds: ['https://official.test'], freshnessHours: 1, independentSourceCount: 1 },
    { id: 'F2', category: 'form', statement: 'Positive form', polarity: 'supportive', confidence: 0.8, sourceIds: ['https://local.test', 'https://expert.test'], freshnessHours: 3, independentSourceCount: 2 },
  ],
  consensus: { direction: 'supportive', score: 0.8, independentSources: 3, supportingSources: 2, adverseSources: 0, contradictionRate: 0 },
  sourceCoverage: { languages: ['en', 'de', 'pl'], official: 1, localMedia: 1, expert: 1, tipster: 0, community: 0 },
  lineupStatus: 'confirmed',
  researchQuality: 0.8,
  warnings: [],
  digest: 'SMOKE-DIGEST',
};

function selection(): Selection {
  return {
    id: 'SMOKE-SEL',
    marketId: 'match-winner',
    eventId: 'EVT-SOC-1001',
    name: 'Home',
    shortName: 'Home',
    odds: 2.2,
    probability: 0.5,
    impliedProbability: 1 / 2.2,
    value: 0.045,
    ev: 0.1,
    confidence: 0.85,
    risk: 'LOW',
    correlationGroup: 'EVT-SOC-1001',
  };
}

describe('Bet Builder functional pipeline smoke', () => {
  it('runs odds -> AI analysis -> Decision Center -> research/evidence -> packet -> approval -> execution -> measurement', async () => {
    const analysis = await analyzeFixture();
    const s = selection();
    const decision = evaluateDecisionCenter([s]);
    expect(decision.status).not.toBe('BLOCKED');

    const orchestrator = orchestrateDecision([s], research);
    expect(orchestrator.control.researchGate.ready).toBe(true);
    expect(orchestrator.packetEligible).toBe(true);
    expect(orchestrator.missionReady).toBe(true);
    expect(orchestrator.evidence).not.toBeNull();

    const packet = createDecisionPacket(decision, [{
      id: s.id, eventId: s.eventId, marketId: s.marketId, odds: s.odds,
      probability: s.probability, confidence: s.confidence, risk: s.risk,
      correlationGroup: s.correlationGroup,
    }], null, new Date('2026-09-18T00:00:00.000Z'), research, orchestrator.evidence);
    expect(packet.mission.eligible).toBe(true);

    const action = analysis.recommendedActions.find((a) => a.missionEligible);
    expect(action).toBeDefined();
    const mission = buildMissionFromAnalysis(analysis, action!, { decisionPacket: packet, idSuffix: 'SMOKE' });

    const missions = new InMemoryMissionRepository();
    const analyses = new InMemoryAnalysisRepository();
    await analyses.save(analysis);
    const service = new MissionService(missions, analyses, new MockCoreEngineClient({ stepDelayMs: 0 }));
    await service.saveDraft(mission);
    await service.requestApproval(mission.id, 'smoke');
    let current = (await missions.getById(mission.id))!;
    expect(current.status).toBe('AWAITING_APPROVAL');

    for (const check of current.approval.checklist) {
      if (check.required) await service.toggleChecklistItem(mission.id, check.id, 'smoke');
    }
    await service.approve(mission.id, 'smoke-approver', 'functional smoke approval');
    current = (await missions.getById(mission.id))!;
    expect(current.status).toBe('APPROVED');
    expect(current.decisionLedger?.approvalState).toBe('APPROVED');

    const completed = await service.execute(mission.id, 'smoke-approver');
    expect(completed.status).toBe('COMPLETED');
    expect(completed.execution?.steps.length).toBeGreaterThan(3);
    expect(completed.measurement).not.toBeNull();
    expect(completed.decisionLedger?.settlement.status).toMatch(/WON|LOST|VOID|CANCELLED/);
    expect(completed.learning.version).toBe(2);
  });
});
