import { describe, expect, it } from 'vitest';
import { analyzeFixture } from './helpers';
import { buildMissionFromAnalysis } from '../missions/missionFactory';
import { assertGuards, canTransition, MissionTransitionError } from '../missions/stateMachine';
import { InMemoryMissionRepository } from '../missions/MissionRepository';
import { InMemoryAnalysisRepository } from '../ai/AnalysisRepository';
import { MissionService } from '../missions/missionService';
import { MockCoreEngineClient, CoreEngineError } from '../engine/CoreEngineClient';
import { evaluateDecisionCenter } from '../core/decisionCenter';
import { createDecisionPacket } from '../core/decisionPacket';
import { liveEvents } from '../services/liveAdapter';
import { isAdmissibleSelection } from '../hooks/useBuilder';
import type { CanonicalDataset } from '../domain/repositories';
import type { Mission } from '../missions/types';

/**
 * Regression guard for the APPROVAL stage.
 *
 * Invariant: no artifact becomes executable without an explicit, attributable human
 * approval. An approval state alone is never a decision — a named approver and a
 * decision timestamp must be recorded, and the checklist must be well-formed.
 */

const engine = new MockCoreEngineClient({ stepDelayMs: 0 });

async function setup() {
  const analysis = await analyzeFixture();
  const missions = new InMemoryMissionRepository();
  const analyses = new InMemoryAnalysisRepository();
  await analyses.save(analysis);
  const service = new MissionService(missions, analyses, engine);
  const action = analysis.recommendedActions.find((a) => a.missionEligible)!;
  const draft = buildMissionFromAnalysis(analysis, action, { idSuffix: 'GATE' });
  return { analysis, missions, analyses, service, draft, action };
}

async function acknowledgeAll(service: MissionService, missions: InMemoryMissionRepository, id: string) {
  const mission = (await missions.getById(id))!;
  for (const check of mission.approval.checklist) await service.toggleChecklistItem(id, check.id, 'tester');
}

const codeOf = (error: unknown) => (error instanceof MissionTransitionError ? error.code : undefined);

function noMarketDataset(events: number): CanonicalDataset {
  return {
    events: Array.from({ length: events }, (_, i) => ({
      id: `thesportsdb:${3000 + i}`, sportKey: i % 2 ? 'cricket' : 'basketball',
      league: { id: `l${i}`, name: `League ${i}`, sportKey: 'soccer', country: 'PL' },
      homeTeam: { id: `h${i}`, name: `Home ${i}`, shortName: `H${i}`, rating: 0.5, form: [], injuriesOut: 0 },
      awayTeam: { id: `a${i}`, name: `Away ${i}`, shortName: `A${i}`, rating: 0.5, form: [], injuriesOut: 0 },
      startTime: '2026-09-24T18:00:00.000Z', status: 'scheduled' as const, venue: 'V', monitored: true, liquidity: 0.5,
    })),
    snapshots: [], issues: [], droppedRecords: 0, normalizedAt: '2026-09-24T12:00:00.000Z',
    provider: 'thesportsdb', mode: 'LIVE_DATA_NO_ODDS',
  };
}

describe('human approval invariant', () => {
  it('DRAFT cannot reach EXECUTING without approval', async () => {
    const { service, missions, draft } = await setup();
    await service.saveDraft(draft);
    expect(canTransition('DRAFT', 'EXECUTING')).toBe(false);
    await expect(service.execute(draft.id, 'x')).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
    expect((await missions.getById(draft.id))!.status).toBe('DRAFT');
  });

  it('DRAFT cannot be approved without requesting approval first', async () => {
    const { service, missions, draft } = await setup();
    await service.saveDraft(draft);
    await expect(service.approve(draft.id, 'approver', 'ok')).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
    expect((await missions.getById(draft.id))!.status).toBe('DRAFT');
  });

  it('PENDING cannot become APPROVED while mandatory checks are outstanding', async () => {
    const { service, missions, draft } = await setup();
    await service.saveDraft(draft);
    await service.requestApproval(draft.id, 'tester');
    await expect(service.approve(draft.id, 'approver', 'ok')).rejects.toMatchObject({ code: 'CHECKLIST_INCOMPLETE' });
    expect((await missions.getById(draft.id))!.status).toBe('AWAITING_APPROVAL');
  });

  it('an APPROVED state without a recorded human decision is not approval', async () => {
    const { draft } = await setup();
    const forged: Mission = {
      ...draft,
      status: 'AWAITING_APPROVAL',
      approval: {
        ...draft.approval,
        state: 'APPROVED',
        checklist: draft.approval.checklist.map((c) => ({ ...c, acknowledged: true })),
        blockers: [],
        decidedBy: null,
        decidedAt: null,
      },
    };
    try { assertGuards(forged, 'APPROVED'); throw new Error('guard did not fire'); }
    catch (error) { expect(codeOf(error)).toBe('APPROVAL_REQUIRED'); }
  });

  it('a missing or malformed checklist is rejected, not crashed on', () => {
    const malformed = {
      id: 'MSN-MALFORMED', status: 'AWAITING_APPROVAL',
      approval: { state: 'APPROVED', checklist: undefined, blockers: [], decidedBy: 'someone', decidedAt: new Date().toISOString() },
    } as unknown as Mission;
    try { assertGuards(malformed, 'APPROVED'); throw new Error('guard did not fire'); }
    catch (error) { expect(codeOf(error)).toBe('CHECKLIST_INCOMPLETE'); }
  });

  it('EXECUTING requires an approved mission carrying a recorded decision', () => {
    const base = {
      id: 'MSN-EXEC', status: 'APPROVED',
      approval: { state: 'APPROVED', checklist: [], blockers: [], decidedBy: null, decidedAt: null },
    } as unknown as Mission;
    try { assertGuards(base, 'EXECUTING'); throw new Error('guard did not fire'); }
    catch (error) { expect(codeOf(error)).toBe('APPROVAL_REQUIRED'); }
  });
});

describe('production state is not approvable', () => {
  it('BLOCKED / NO_MARKET_DATA / NO_BUILDABLE_SELECTIONS / INSUFFICIENT_DATA cannot create a mission', async () => {
    const analysis = await analyzeFixture();
    const action = analysis.recommendedActions.find((a) => a.missionEligible)!;
    const decision = evaluateDecisionCenter([]);
    const packet = createDecisionPacket(decision, [], null, new Date('2026-09-24T00:00:00.000Z'));
    expect(decision.status).toBe('BLOCKED');
    expect(packet.mission.eligible).toBe(false);
    expect(() => buildMissionFromAnalysis(analysis, action, { decisionPacket: packet })).toThrow(/DECISION_PACKET_BLOCKED/);
  });

  it('18 production events yield zero approvable candidates', () => {
    const projected = liveEvents(noMarketDataset(18));
    const decision = evaluateDecisionCenter([]);
    const packet = createDecisionPacket(decision, [], null, new Date('2026-09-24T00:00:00.000Z'));
    const candidates = noMarketDataset(18).events.map((event) => {
      const legacy = projected.find((p) => p.id === event.id);
      const buildable = legacy ? legacy.markets.flatMap((m) => m.selections).filter(isAdmissibleSelection) : [];
      return { eventId: event.id, buildable: buildable.length, eligible: packet.mission.eligible, status: decision.status };
    });
    expect(candidates).toHaveLength(18);
    expect(new Set(candidates.map((c) => c.eventId)).size).toBe(18);
    expect(candidates.every((c) => c.buildable === 0)).toBe(true);
    expect(candidates.every((c) => !c.eligible)).toBe(true);
    expect(candidates.every((c) => c.status === 'BLOCKED')).toBe(true);
  });
});

describe('approval lifecycle reaches APPROVED only via explicit action', () => {
  it('walks DATA_SUPPORTED fixture DRAFT -> AWAITING_APPROVAL -> APPROVED', async () => {
    const { service, missions, draft } = await setup();
    const saved = await service.saveDraft(draft);
    expect(saved.status).toBe('DRAFT');
    expect(saved.approval.state).toBe('PENDING');
    expect(saved.approval.decidedBy).toBeNull();
    expect(saved.approval.decidedAt).toBeNull();

    const requested = await service.requestApproval(draft.id, 'tester');
    expect(requested.status).toBe('AWAITING_APPROVAL');
    expect(requested.approval.requestedBy).toBe('tester');
    // Requesting approval is not approving.
    expect(requested.approval.state).toBe('PENDING');
    expect(requested.approval.decidedBy).toBeNull();

    await acknowledgeAll(service, missions, draft.id);
    const approved = await service.approve(draft.id, 'approver', 'observation only');
    expect(approved.status).toBe('APPROVED');
    expect(approved.approval.state).toBe('APPROVED');
    expect(approved.approval.decidedBy).toBe('approver');
    expect(approved.approval.decidedAt).toBeTruthy();
    expect(approved.approval.note).toBe('observation only');
    expect(approved.history.map((h) => h.to)).toEqual(['DRAFT', 'AWAITING_APPROVAL', 'APPROVED']);
    expect(approved.execution).toBeNull();
    expect(approved.measurement).toBeNull();
  });

  it('rejects an approval with no named approver', async () => {
    const { service, missions, draft } = await setup();
    await service.saveDraft(draft);
    await service.requestApproval(draft.id, 'tester');
    await acknowledgeAll(service, missions, draft.id);
    await expect(service.approve(draft.id, '   ', 'ok')).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });
    expect((await missions.getById(draft.id))!.status).toBe('AWAITING_APPROVAL');
  });
});

describe('approval audit trail', () => {
  it('preserves ids, state, transition, timestamp, actor and reason', async () => {
    const analysis = await analyzeFixture();
    const missions = new InMemoryMissionRepository();
    const analyses = new InMemoryAnalysisRepository();
    await analyses.save(analysis);
    const service = new MissionService(missions, analyses, engine);
    const action = analysis.recommendedActions.find((a) => a.missionEligible)!;
    const decision = evaluateDecisionCenter([{
      id: 'GATE-SEL', marketId: 'match-winner', eventId: analysis.eventId, name: 'Home', shortName: 'Home',
      odds: 2.2, probability: 0.5, impliedProbability: 1 / 2.2, value: 0.045, ev: 0.1,
      confidence: 0.85, risk: 'LOW', correlationGroup: analysis.eventId,
    }]);
    const packet = createDecisionPacket(decision, [{ id: 'GATE-SEL', eventId: analysis.eventId, marketId: 'match-winner', odds: 2.2, probability: 0.5, confidence: 0.85, risk: 'LOW', correlationGroup: analysis.eventId }], null, new Date('2026-09-24T00:00:00.000Z'));
    expect(packet.mission.eligible).toBe(true);
    const draft = buildMissionFromAnalysis(analysis, action, { decisionPacket: packet, idSuffix: 'AUDIT' });
    await service.saveDraft(draft);
    await service.requestApproval(draft.id, 'tester');
    await acknowledgeAll(service, missions, draft.id);
    const approved = await service.approve(draft.id, 'approver', 'observation only');
    const last = approved.history.at(-1)!;
    expect(approved.id).toBe(draft.id);
    expect(approved.decisionPacket?.id).toBe(packet.id);
    expect(approved.decisionLedger?.id).toBe(`LED-${packet.id}`);
    expect(approved.decisionLedger?.missionId).toBe(draft.id);
    expect(last.from).toBe('AWAITING_APPROVAL');
    expect(last.to).toBe('APPROVED');
    expect(last.actor).toBe('approver');
    expect(last.reason).toBe('observation only');
    expect(Number.isFinite(Date.parse(last.at))).toBe(true);
    expect(approved.decisionLedger?.approvalState).toBe('APPROVED');
  });
});

describe('approval idempotency and guards', () => {
  it('a duplicate approval is rejected without resetting or overwriting', async () => {
    const { service, missions, draft } = await setup();
    await service.saveDraft(draft);
    await service.requestApproval(draft.id, 'tester');
    await acknowledgeAll(service, missions, draft.id);
    const first = await service.approve(draft.id, 'approver', 'first');
    const historyLength = first.history.length;
    await expect(service.approve(draft.id, 'attacker', 'second')).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
    const final = (await missions.getById(draft.id))!;
    expect(final.approval.decidedBy).toBe('approver');
    expect(final.approval.note).toBe('first');
    expect(final.history).toHaveLength(historyLength);
    expect(final.status).toBe('APPROVED');
  });

  it('approval after rejection is rejected', async () => {
    const { service, missions, draft } = await setup();
    await service.saveDraft(draft);
    await service.requestApproval(draft.id, 'tester');
    const rejected = await service.reject(draft.id, 'approver', 'thin coverage');
    expect(rejected.status).toBe('CANCELLED');
    expect(rejected.approval.state).toBe('REJECTED');
    await expect(service.approve(draft.id, 'approver', 'ok')).rejects.toMatchObject({ code: 'ALREADY_TERMINAL' });
    expect((await missions.getById(draft.id))!.status).toBe('CANCELLED');
  });

  it('unknown mission and empty mission id are rejected', async () => {
    const { service } = await setup();
    await expect(service.approve('MSN-DOES-NOT-EXIST', 'approver', 'ok')).rejects.toThrow(/not found/);
    await expect(service.requestApproval('', 'tester')).rejects.toThrow(/not found/);
  });

  it('the engine boundary rejects an unapproved mission', async () => {
    const { draft } = await setup();
    await expect(engine.submitMission(draft)).rejects.toBeInstanceOf(CoreEngineError);
    await expect(engine.submitMission({ ...draft, status: 'APPROVED' })).rejects.toBeInstanceOf(CoreEngineError);
  });
});
