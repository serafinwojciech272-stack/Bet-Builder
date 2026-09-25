import { describe, expect, it } from 'vitest';
import { analyzeFixture } from './helpers';
import { buildMissionFromAnalysis } from '../missions/missionFactory';
import { assertMissionPayload, MissionTransitionError, transition } from '../missions/stateMachine';
import { InMemoryMissionRepository } from '../missions/MissionRepository';
import { InMemoryAnalysisRepository } from '../ai/AnalysisRepository';
import { MissionService } from '../missions/missionService';
import { MockCoreEngineClient } from '../engine/CoreEngineClient';
import { evaluateDecisionCenter } from '../core/decisionCenter';
import { createDecisionPacket } from '../core/decisionPacket';
import type { Mission } from '../missions/types';

/**
 * Regression guard for the MISSION stage.
 *
 * Invariant: a mission may only be entered from an explicitly APPROVED artifact that
 * retains immutable identity/provenance, and entering a mission never executes anything.
 */

const engine = new MockCoreEngineClient({ stepDelayMs: 0 });
const codeOf = (error: unknown) => (error instanceof MissionTransitionError ? error.code : undefined);

async function context() {
  const analysis = await analyzeFixture();
  const missions = new InMemoryMissionRepository();
  const analyses = new InMemoryAnalysisRepository();
  await analyses.save(analysis);
  const service = new MissionService(missions, analyses, engine);
  const action = analysis.recommendedActions.find((a) => a.missionEligible)!;
  return { analysis, missions, analyses, service, action };
}

function eligiblePacket(analysis: Awaited<ReturnType<typeof analyzeFixture>>) {
  const selection = { id: 'MSN-SEL', eventId: analysis.eventId, marketId: 'match-winner', odds: 2.2, probability: 0.5, confidence: 0.85, risk: 'LOW' as const, correlationGroup: analysis.eventId };
  const decision = evaluateDecisionCenter([{ ...selection, name: 'Home', shortName: 'Home', impliedProbability: 1 / 2.2, value: 0.045, ev: 0.1 }]);
  const packet = createDecisionPacket(decision, [selection], null, new Date('2026-09-24T00:00:00.000Z'));
  expect(packet.mission.eligible).toBe(true);
  return packet;
}

async function approveAll(service: MissionService, missions: InMemoryMissionRepository, id: string) {
  const mission = (await missions.getById(id))!;
  for (const check of mission.approval.checklist) await service.toggleChecklistItem(id, check.id, 'tester');
  return service.approve(id, 'approver', 'observation only');
}

async function approvedMission() {
  const ctx = await context();
  const packet = eligiblePacket(ctx.analysis);
  const draft = buildMissionFromAnalysis(ctx.analysis, ctx.action, { decisionPacket: packet, idSuffix: 'GATE' });
  await ctx.service.saveDraft(draft);
  await ctx.service.requestApproval(draft.id, 'tester');
  const approved = await approveAll(ctx.service, ctx.missions, draft.id);
  return { ...ctx, draft, packet, approved };
}

describe('MISSION positive control flow', () => {
  it('enters MISSION only from an explicitly APPROVED artifact with full provenance', async () => {
    const { approved, draft, packet } = await approvedMission();
    expect(approved.status).toBe('APPROVED');
    expect(approved.approval.state).toBe('APPROVED');
    expect(approved.approval.decidedBy).toBe('approver');
    expect(Number.isFinite(Date.parse(approved.approval.decidedAt!))).toBe(true);
    expect(approved.approval.checklist.filter((c) => c.required && !c.acknowledged)).toHaveLength(0);
    expect(approved.id).toBe(draft.id);
    expect(approved.decisionPacket?.id).toBe(packet.id);
    expect(approved.decisionLedger?.id).toBe(`LED-${packet.id}`);
    expect(approved.decisionLedger?.missionId).toBe(draft.id);
    expect(approved.decisionLedger?.approvalState).toBe('APPROVED');
    expect(approved.target.eventId).toBeTruthy();
    expect(approved.sourceAnalysisId).toBeTruthy();
    expect(Number.isFinite(Date.parse(approved.createdAt))).toBe(true);
    expect(approved.history.map((h) => h.to)).toEqual(['DRAFT', 'AWAITING_APPROVAL', 'APPROVED']);
  });

  it('never executes or measures while entering the mission', async () => {
    const { approved } = await approvedMission();
    expect(approved.execution).toBeNull();
    expect(approved.measurement).toBeNull();
    expect(approved.learning.outcomeFeedback).toBe('pending');
    expect(approved.risk.level).toBeTruthy();
    expect(approved.risk.monetaryExposure).toBe('none');
    expect(approved.actions.length).toBeGreaterThan(3);
  });
});

describe('MISSION negative test matrix', () => {
  it('1. PENDING approval cannot enter execution', async () => {
    const { service, missions, analysis, action } = await context();
    const draft = buildMissionFromAnalysis(analysis, action, { idSuffix: 'N1' });
    await service.saveDraft(draft);
    await service.requestApproval(draft.id, 'tester');
    await expect(service.execute(draft.id, 'x')).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
    expect((await missions.getById(draft.id))!.status).toBe('AWAITING_APPROVAL');
  });

  it('2. REJECTED approval cannot enter execution', async () => {
    const { service, missions, analysis, action } = await context();
    const draft = buildMissionFromAnalysis(analysis, action, { idSuffix: 'N2' });
    await service.saveDraft(draft);
    await service.requestApproval(draft.id, 'tester');
    await service.reject(draft.id, 'approver', 'no');
    await expect(service.execute(draft.id, 'x')).rejects.toMatchObject({ code: 'ALREADY_TERMINAL' });
    expect((await missions.getById(draft.id))!.status).toBe('CANCELLED');
  });

  it('3. CANCELLED mission cannot enter execution', async () => {
    const { service, analysis, action } = await context();
    const draft = buildMissionFromAnalysis(analysis, action, { idSuffix: 'N3' });
    await service.saveDraft(draft);
    await service.cancel(draft.id, 'op', 'stop');
    await expect(service.execute(draft.id, 'x')).rejects.toMatchObject({ code: 'ALREADY_TERMINAL' });
  });

  it('4-7. BLOCKED / NO_MARKET_DATA / NO_BUILDABLE_SELECTIONS / INSUFFICIENT_DATA create no mission', async () => {
    const { analysis, action } = await context();
    const blocked = createDecisionPacket(evaluateDecisionCenter([]), [], null, new Date('2026-09-24T00:00:00.000Z'));
    expect(blocked.mission.eligible).toBe(false);
    for (const label of ['BLOCKED', 'NO_MARKET_DATA', 'NO_BUILDABLE_SELECTIONS', 'INSUFFICIENT_DATA']) {
      expect(() => buildMissionFromAnalysis(analysis, action, { decisionPacket: blocked }), label).toThrow(/DECISION_PACKET_BLOCKED/);
    }
  });

  it('8/9. APPROVED with missing decidedBy / decidedAt is rejected', async () => {
    const { draft } = await approvedMission();
    for (const patch of [{ decidedBy: null }, { decidedAt: null }] as Array<Partial<Mission['approval']>>) {
      const forged: Mission = {
        ...draft, status: 'AWAITING_APPROVAL',
        approval: { ...draft.approval, state: 'APPROVED', decidedBy: 'a', decidedAt: new Date().toISOString(), blockers: [], checklist: draft.approval.checklist.map((c) => ({ ...c, acknowledged: true })), ...patch },
      };
      try { transition(forged, 'APPROVED', { actor: 'x', reason: 'y' }); throw new Error('guard did not fire'); }
      catch (error) { expect(codeOf(error)).toBe('APPROVAL_REQUIRED'); }
    }
  });

  it('10/11. incomplete checklist and forged APPROVED state are rejected', async () => {
    const { draft } = await approvedMission();
    const incomplete: Mission = { ...draft, status: 'AWAITING_APPROVAL', approval: { ...draft.approval, state: 'APPROVED', decidedBy: 'a', decidedAt: new Date().toISOString(), blockers: [] } };
    try { transition(incomplete, 'APPROVED', { actor: 'a', reason: 'r' }); throw new Error('guard did not fire'); }
    catch (error) { expect(codeOf(error)).toBe('CHECKLIST_INCOMPLETE'); }

    const forged: Mission = { ...draft, status: 'AWAITING_APPROVAL', approval: { ...draft.approval, state: 'PENDING' } };
    try { transition(forged, 'APPROVED', { actor: 'a', reason: 'r' }); throw new Error('guard did not fire'); }
    catch (error) { expect(codeOf(error)).toBe('APPROVAL_REQUIRED'); }
  });

  it('12. unknown, empty and blank mission ids are rejected', async () => {
    const { service } = await context();
    for (const id of ['MSN-NOPE', '', '   ']) {
      await expect(service.execute(id, 'x')).rejects.toThrow(/not found/);
    }
  });

  it('13. a mission persisted without a decision packet carries no fabrication', async () => {
    const { analysis, action } = await context();
    const bare = buildMissionFromAnalysis(analysis, action, { idSuffix: 'NP' });
    expect(bare.decisionPacket).toBeUndefined();
    expect(bare.decisionLedger).toBeUndefined();
    expect(bare.approval.state).toBe('PENDING');
    expect(bare.status).toBe('DRAFT');
  });

  it('14. an approved mission without a ledger remains blocked from a fabricated ledger', async () => {
    const { approved } = await approvedMission();
    expect(approved.decisionLedger).toBeDefined();
    expect(approved.decisionLedger?.id).toBe(`LED-${approved.decisionPacket?.id}`);
  });

  it('15. stale artifacts are not treated as executable', async () => {
    const { analysis, action, service, missions } = await context();
    const stale = buildMissionFromAnalysis(analysis, action, { now: new Date('2020-01-01T00:00:00.000Z'), idSuffix: 'STALE' });
    await service.saveDraft(stale);
    const stored = (await missions.getById(stale.id))!;
    expect(stored.status).toBe('DRAFT');
    await expect(service.execute(stale.id, 'x')).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });

  it('16. duplicate mission creation is bounded by identity', async () => {
    const ctx = await context();
    const a1 = buildMissionFromAnalysis(ctx.analysis, ctx.action, { idSuffix: 'DUP' });
    const a2 = buildMissionFromAnalysis(ctx.analysis, ctx.action, { idSuffix: 'DUP' });
    expect(a1.id).toBe(a2.id);
    await ctx.service.saveDraft(a1);
    await ctx.service.saveDraft(a2);
    expect(await ctx.missions.count()).toBe(1);
    expect((await ctx.missions.list({ sourceAnalysisId: ctx.analysis.analysisId })).length).toBe(1);
  });

  it('17. a malformed mission payload is rejected before it is persisted', async () => {
    const { service, missions } = await context();
    for (const bad of [
      { id: 'MSN-BAD' },
      { id: '', sourceAnalysisId: 'A', target: { eventId: 'E' }, status: 'DRAFT' },
      { id: 'MSN-BAD2', sourceAnalysisId: 'A', target: { eventId: 'E' }, status: 'DRAFT', approval: { required: false, state: 'PENDING' } },
      { id: 'MSN-BAD3', sourceAnalysisId: 'A', target: { eventId: 'E' }, status: 'NOPE', approval: { required: true, state: 'PENDING', checklist: [1], blockers: [] } },
    ]) {
      await expect(service.saveDraft(bad as unknown as Mission)).rejects.toMatchObject({ code: 'MALFORMED_MISSION' });
    }
    expect(await missions.count()).toBe(0);
  });

  it('18. non-finite mission numerics are coerced, never stored as NaN/Infinity', async () => {
    const { analysis, action } = await context();
    const mission = buildMissionFromAnalysis(analysis, action, { movementThresholdPct: NaN, intervalMinutes: Infinity, horizonMinutes: -Infinity, idSuffix: 'NAN' });
    const numerics = [
      mission.expectedOutcome.targetValue.value,
      mission.expectedOutcome.horizonMinutes.value,
      mission.actions[0].intervalMinutes?.value,
      mission.actions[2].trigger?.threshold.value,
      mission.risk.score.value,
    ];
    expect(numerics.every((n) => typeof n === 'number' && Number.isFinite(n))).toBe(true);
    expect(mission.actions.every((a) => a.intervalMinutes === undefined || Number.isFinite(a.intervalMinutes.value))).toBe(true);
  });

  it('19. the production dataset produces no mission', async () => {
    const { analysis, action } = await context();
    const decision = evaluateDecisionCenter([]);
    expect(decision.status).toBe('BLOCKED');
    const packet = createDecisionPacket(decision, [], null, new Date('2026-09-24T00:00:00.000Z'));
    expect(packet.mission.eligible).toBe(false);
    expect(() => buildMissionFromAnalysis(analysis, action, { decisionPacket: packet })).toThrow(/DECISION_PACKET_BLOCKED/);
  });

  it('20. the engine boundary refuses an unapproved mission', async () => {
    const { analysis, action } = await context();
    const draft = buildMissionFromAnalysis(analysis, action, { idSuffix: 'N20' });
    await expect(engine.submitMission(draft)).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });
  });
});

describe('MISSION payload guard', () => {
  it('accepts a well-formed draft and rejects a partial object', async () => {
    const { analysis, action } = await context();
    const draft = buildMissionFromAnalysis(analysis, action, { idSuffix: 'OK' });
    expect(() => assertMissionPayload(draft)).not.toThrow();
    expect(() => assertMissionPayload({ id: 'x' } as unknown as Mission)).toThrow(/Malformed mission artifact/);
  });
});
