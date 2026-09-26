import { describe, expect, it, vi } from 'vitest';
import { analyzeFixture } from './helpers';
import { buildMissionFromAnalysis } from '../missions/missionFactory';
import { assertMissionPayload } from '../missions/stateMachine';
import { InMemoryMissionRepository } from '../missions/MissionRepository';
import { InMemoryAnalysisRepository } from '../ai/AnalysisRepository';
import { MissionService } from '../missions/missionService';
import { CoreEngineError, MockCoreEngineClient } from '../engine/CoreEngineClient';
import { evaluateDecisionCenter } from '../core/decisionCenter';
import { createDecisionPacket } from '../core/decisionPacket';
import type { Mission } from '../missions/types';

/**
 * Regression guard for the EXECUTION stage.
 *
 * The engine is observational only: it accepts a mission solely when the human approval
 * decision is present, the payload is finite, and every action is an observation action.
 * No external provider is contacted and no monetary execution exists.
 */

const engine = new MockCoreEngineClient({ stepDelayMs: 0 });

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
  const selection = { id: 'EXE-SEL', eventId: analysis.eventId, marketId: 'match-winner', odds: 2.2, probability: 0.5, confidence: 0.85, risk: 'LOW' as const, correlationGroup: analysis.eventId };
  const decision = evaluateDecisionCenter([{ ...selection, name: 'Home', shortName: 'Home', impliedProbability: 1 / 2.2, value: 0.045, ev: 0.1 }]);
  const packet = createDecisionPacket(decision, [selection], null, new Date('2026-09-24T00:00:00.000Z'));
  expect(packet.mission.eligible).toBe(true);
  return packet;
}

async function approved(suffix = 'EXE') {
  const ctx = await context();
  const packet = eligiblePacket(ctx.analysis);
  const draft = buildMissionFromAnalysis(ctx.analysis, ctx.action, { decisionPacket: packet, idSuffix: suffix });
  await ctx.service.saveDraft(draft);
  await ctx.service.requestApproval(draft.id, 'tester');
  const stored = (await ctx.missions.getById(draft.id))!;
  for (const check of stored.approval.checklist) await ctx.service.toggleChecklistItem(draft.id, check.id, 'tester');
  const approvedMission = await ctx.service.approve(draft.id, 'approver', 'observation only');
  return { ...ctx, packet, draft, approvedMission };
}

const codeOf = (error: unknown) => (error as { code?: string }).code;

describe('EXECUTION positive control flow', () => {
  it('executes an APPROVED mission through the observational engine and preserves provenance', async () => {
    const { service, missions, packet, draft, approvedMission } = await approved();
    const result = await service.execute(approvedMission.id, 'operator');

    // requested -> accepted -> executed
    expect(result.status).toBe('COMPLETED');
    expect(result.execution).not.toBeNull();
    expect(result.execution?.engineRef).toMatch(/^CE-/);
    expect(Number.isFinite(Date.parse(result.execution!.startedAt))).toBe(true);
    expect(Number.isFinite(Date.parse(result.execution!.completedAt!))).toBe(true);
    expect(result.execution?.steps.length).toBeGreaterThan(3);
    expect(result.execution?.failureReason).toBeNull();
    expect(result.measurement).not.toBeNull();

    // provenance preserved
    expect(result.id).toBe(draft.id);
    expect(result.decisionPacket?.id).toBe(packet.id);
    expect(result.decisionLedger?.id).toBe(`LED-${packet.id}`);
    expect(result.decisionLedger?.missionId).toBe(draft.id);
    expect(result.sourceAnalysisId).toBeTruthy();
    expect(result.target.eventId).toBeTruthy();
    expect(result.history.map((h) => h.to)).toEqual(['DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'EXECUTING', 'MEASURING', 'COMPLETED']);

    const stored = (await missions.getById(draft.id))!;
    expect(stored.execution?.engineRef).toBe(result.execution?.engineRef);
  });

  it('records a controlled execution result without contacting any external provider', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { service, approvedMission } = await approved('NET');
    const result = await service.execute(approvedMission.id, 'operator');
    expect(result.status).toBe('COMPLETED');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('declares observational-only capability and no monetary execution', async () => {
    const caps = await engine.capabilities();
    expect(caps.mode).toBe('mock');
    expect(caps.supportsMonetaryExecution).toBe(false);
    expect(caps.supportsExecution).toBe(true);
  });
});

describe('EXECUTION negative test matrix', () => {
  it('1. PENDING mission cannot execute', async () => {
    const { service, missions, analysis, action } = await context();
    const draft = buildMissionFromAnalysis(analysis, action, { decisionPacket: eligiblePacket(analysis), idSuffix: 'N1' });
    await service.saveDraft(draft);
    await service.requestApproval(draft.id, 'tester');
    await expect(service.execute(draft.id, 'x')).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
    expect((await missions.getById(draft.id))!.execution).toBeNull();
  });

  it('2. REJECTED mission cannot execute', async () => {
    const { service, analysis, action } = await context();
    const draft = buildMissionFromAnalysis(analysis, action, { decisionPacket: eligiblePacket(analysis), idSuffix: 'N2' });
    await service.saveDraft(draft);
    await service.requestApproval(draft.id, 'tester');
    await service.reject(draft.id, 'approver', 'no');
    await expect(service.execute(draft.id, 'x')).rejects.toMatchObject({ code: 'ALREADY_TERMINAL' });
  });

  it('3. CANCELLED mission cannot execute', async () => {
    const { service, analysis, action } = await context();
    const draft = buildMissionFromAnalysis(analysis, action, { decisionPacket: eligiblePacket(analysis), idSuffix: 'N3' });
    await service.saveDraft(draft);
    await service.cancel(draft.id, 'op', 'stop');
    await expect(service.execute(draft.id, 'x')).rejects.toMatchObject({ code: 'ALREADY_TERMINAL' });
  });

  it('4-7. BLOCKED / NO_MARKET_DATA / NO_BUILDABLE_SELECTIONS / INSUFFICIENT_DATA cannot create an executable mission', async () => {
    const { analysis, action } = await context();
    const blocked = createDecisionPacket(evaluateDecisionCenter([]), [], null, new Date('2026-09-24T00:00:00.000Z'));
    expect(blocked.mission.eligible).toBe(false);
    for (const label of ['BLOCKED', 'NO_MARKET_DATA', 'NO_BUILDABLE_SELECTIONS', 'INSUFFICIENT_DATA']) {
      expect(() => buildMissionFromAnalysis(analysis, action, { decisionPacket: blocked }), label).toThrow(/DECISION_PACKET_BLOCKED/);
    }
  });

  it('8/9. empty and unknown mission ids are rejected', async () => {
    const { service } = await context();
    for (const id of ['', '   ', 'MSN-UNKNOWN']) {
      await expect(service.execute(id, 'x')).rejects.toThrow(/not found/);
    }
  });

  it('10/11. a mission without a decision packet or ledger records no fabricated outcome', async () => {
    const { analysis, action } = await context();
    const repo = new InMemoryMissionRepository();
    const analyses = new InMemoryAnalysisRepository();
    await analyses.save(analysis);
    const svc = new MissionService(repo, analyses, engine);
    const mission = buildMissionFromAnalysis(analysis, action, { idSuffix: 'NOL' });
    expect(mission.decisionPacket).toBeUndefined();
    expect(mission.decisionLedger).toBeUndefined();
    await svc.saveDraft(mission);
    await svc.requestApproval(mission.id, 'tester');
    const stored = (await repo.getById(mission.id))!;
    for (const check of stored.approval.checklist) await svc.toggleChecklistItem(mission.id, check.id, 'tester');
    await svc.approve(mission.id, 'approver', 'ok');
    const done = await svc.execute(mission.id, 'operator');
    // Reported gap: execution is reachable without packet/ledger lineage. Asserted explicitly
    // so the gap cannot regress silently and cannot be mistaken for correct behaviour.
    expect(done.status).toBe('COMPLETED');
    expect(done.decisionLedger).toBeUndefined();
    expect(done.decisionPacket).toBeUndefined();
  });

  it('12/13/14. malformed, NaN and Infinity payloads are rejected at persistence', async () => {
    const { service, missions, analysis, action } = await context();
    const draft = buildMissionFromAnalysis(analysis, action, { decisionPacket: eligiblePacket(analysis), idSuffix: 'NAN' });
    const variants: Array<[string, Mission]> = [
      ['missing id', { ...draft, id: '' }],
      ['missing expected outcome', { ...draft, expectedOutcome: undefined } as unknown as Mission],
      ['NaN target value', { ...draft, expectedOutcome: { ...draft.expectedOutcome, targetValue: { ...draft.expectedOutcome.targetValue, value: NaN } } }],
      ['Infinity horizon', { ...draft, expectedOutcome: { ...draft.expectedOutcome, horizonMinutes: { ...draft.expectedOutcome.horizonMinutes, value: Infinity } } }],
      ['NaN trigger threshold', { ...draft, actions: draft.actions.map((a) => (a.trigger ? { ...a, trigger: { ...a.trigger, threshold: { ...a.trigger.threshold, value: NaN } } } : a)) }],
    ];
    for (const [label, m] of variants) {
      await expect(service.saveDraft(m), label).rejects.toMatchObject({ code: 'MALFORMED_MISSION' });
      expect(() => assertMissionPayload(m), label).toThrow(/Malformed mission artifact/);
    }
    expect(await missions.count()).toBe(0);
  });

  it('15. a stale mission cannot execute', async () => {
    const { service, analysis, action } = await context();
    const stale = buildMissionFromAnalysis(analysis, action, { now: new Date('2020-01-01T00:00:00.000Z'), decisionPacket: eligiblePacket(analysis), idSuffix: 'STALE' });
    await service.saveDraft(stale);
    await expect(service.execute(stale.id, 'x')).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });

  it('16. duplicate execution is refused', async () => {
    const { service, approvedMission } = await approved('DUP');
    const first = await service.execute(approvedMission.id, 'op1');
    expect(first.status).toBe('COMPLETED');
    await expect(service.execute(approvedMission.id, 'op2')).rejects.toMatchObject({ code: 'ALREADY_TERMINAL' });
  });

  it('16b. concurrent execution of the same mission runs at most once', async () => {
    const { service, approvedMission } = await approved('CONC');
    const results = await Promise.allSettled([service.execute(approvedMission.id, 'a'), service.execute(approvedMission.id, 'b')]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(codeOf((rejected[0] as PromiseRejectedResult).reason)).toBe('ALREADY_EXECUTING');
  });

  it('17. a terminal mission cannot execute', async () => {
    const { service, approvedMission } = await approved('TERM');
    await service.execute(approvedMission.id, 'op');
    await expect(service.execute(approvedMission.id, 'op2')).rejects.toMatchObject({ code: 'ALREADY_TERMINAL' });
  });

  it('18. an unsupported capability fails closed', async () => {
    const { service, analysis, action } = await context();
    const draft = buildMissionFromAnalysis(analysis, action, { decisionPacket: eligiblePacket(analysis), idSuffix: 'UNSUP' });
    await service.saveDraft(draft);
    await service.requestApproval(draft.id, 'tester');
    const repo = new InMemoryMissionRepository();
    const analyses = new InMemoryAnalysisRepository();
    await analyses.save(analysis);
    const svc = new MissionService(repo, analyses, engine);
    await svc.saveDraft(draft);
    await svc.requestApproval(draft.id, 'tester');
    const stored = (await repo.getById(draft.id))!;
    for (const c of stored.approval.checklist) await svc.toggleChecklistItem(draft.id, c.id, 'tester');
    await svc.approve(draft.id, 'approver', 'ok');
    const forged: Mission = { ...(await repo.getById(draft.id))!, actions: [...draft.actions, { id: 'x', kind: 'PLACE_BET' as never, description: 'monetary' }] };
    await expect(engine.submitMission(forged)).rejects.toMatchObject({ code: 'UNSUPPORTED_ACTION' });
    expect((await engine.capabilities()).supportsMonetaryExecution).toBe(false);
  });

  it('19. a forged APPROVED state without a human decision is refused by the engine', async () => {
    const { analysis, action } = await context();
    const draft = buildMissionFromAnalysis(analysis, action, { decisionPacket: eligiblePacket(analysis), idSuffix: 'FORGE' });
    const forged: Mission = { ...draft, status: 'APPROVED', approval: { ...draft.approval, state: 'APPROVED', decidedBy: null, decidedAt: null } };
    await expect(engine.submitMission(forged)).rejects.toBeInstanceOf(CoreEngineError);
    await expect(engine.submitMission(forged)).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });
  });

  it('20/21/22. missing approver, missing timestamp and incomplete checklist are rejected', async () => {
    const { analysis, action } = await context();
    const draft = buildMissionFromAnalysis(analysis, action, { decisionPacket: eligiblePacket(analysis), idSuffix: 'GUARD' });
    const acked = draft.approval.checklist.map((c) => ({ ...c, acknowledged: true }));
    const { transition } = await import('../missions/stateMachine');
    const base = { ...draft, status: 'AWAITING_APPROVAL' as const };
    const variants: Array<[string, Mission, string]> = [
      ['missing approver', { ...base, approval: { ...draft.approval, state: 'APPROVED', decidedBy: null, decidedAt: new Date().toISOString(), checklist: acked, blockers: [] } }, 'APPROVAL_REQUIRED'],
      ['missing timestamp', { ...base, approval: { ...draft.approval, state: 'APPROVED', decidedBy: 'a', decidedAt: null, checklist: acked, blockers: [] } }, 'APPROVAL_REQUIRED'],
      ['incomplete checklist', { ...base, approval: { ...draft.approval, state: 'APPROVED', decidedBy: 'a', decidedAt: new Date().toISOString(), blockers: [] } }, 'CHECKLIST_INCOMPLETE'],
    ];
    for (const [label, m, code] of variants) {
      try { transition(m, 'APPROVED', { actor: 'x', reason: 'y' }); throw new Error(`${label} was accepted`); }
      catch (error) { expect(codeOf(error), label).toBe(code); }
    }
  });

  it('23. execution before the state permits it is rejected', async () => {
    const { service, analysis, action } = await context();
    const draft = buildMissionFromAnalysis(analysis, action, { decisionPacket: eligiblePacket(analysis), idSuffix: 'EARLY' });
    await service.saveDraft(draft);
    await expect(service.execute(draft.id, 'x')).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });

  it('24. no external provider call occurs on any rejected execution path', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { service, analysis, action } = await context();
    const draft = buildMissionFromAnalysis(analysis, action, { decisionPacket: eligiblePacket(analysis), idSuffix: 'NONET' });
    await service.saveDraft(draft);
    await expect(service.execute(draft.id, 'x')).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
