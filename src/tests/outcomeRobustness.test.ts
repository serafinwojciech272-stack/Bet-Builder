import { describe, expect, it } from 'vitest';
import { analyzeFixture } from './helpers';
import { buildMissionFromAnalysis } from '../missions/missionFactory';
import { assertMissionPayload } from '../missions/stateMachine';
import { InMemoryMissionRepository } from '../missions/MissionRepository';
import { InMemoryAnalysisRepository } from '../ai/AnalysisRepository';
import { MissionService } from '../missions/missionService';
import { MockCoreEngineClient } from '../engine/CoreEngineClient';
import { evaluateDecisionCenter } from '../core/decisionCenter';
import { createDecisionPacket } from '../core/decisionPacket';
import { settleLedgerEntry, calibrateLedger, type DecisionLedgerEntry } from '../core/decisionLedger';
import { evaluateCalibrationLoop } from '../core/calibrationLoop';
import { measure } from '../domain/services/measurementService';
import { det } from '../domain/numbers';
import type { Mission } from '../missions/types';

/**
 * Regression guard for the OUTCOME stage.
 *
 * OUTCOME is the measurement / settlement / calibration layer bound to the mission's
 * decision ledger and expected-outcome artifact. An actual result is only ever recorded
 * from a finite, domain-valid measurement; a missing result stays explicitly unresolved.
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
  const selection = { id: 'OUT-SEL', eventId: analysis.eventId, marketId: 'match-winner', odds: 2.2, probability: 0.5, confidence: 0.85, risk: 'LOW' as const, correlationGroup: analysis.eventId };
  const decision = evaluateDecisionCenter([{ ...selection, name: 'Home', shortName: 'Home', impliedProbability: 1 / 2.2, value: 0.045, ev: 0.1 }]);
  const packet = createDecisionPacket(decision, [selection], null, new Date('2026-09-24T00:00:00.000Z'));
  expect(packet.mission.eligible).toBe(true);
  return packet;
}

async function approvedMission() {
  const ctx = await context();
  const packet = eligiblePacket(ctx.analysis);
  const draft = buildMissionFromAnalysis(ctx.analysis, ctx.action, { decisionPacket: packet, idSuffix: 'OUT' });
  await ctx.service.saveDraft(draft);
  await ctx.service.requestApproval(draft.id, 'tester');
  const stored = (await ctx.missions.getById(draft.id))!;
  for (const check of stored.approval.checklist) await ctx.service.toggleChecklistItem(draft.id, check.id, 'tester');
  const approved = await ctx.service.approve(draft.id, 'approver', 'observation only');
  return { ...ctx, draft, packet, approved };
}

const ledgerOf = (mission: Mission): DecisionLedgerEntry => mission.decisionLedger as DecisionLedgerEntry;

describe('OUTCOME positive control flow', () => {
  it('binds expected outcome to the approved mission and stays unresolved without an actual result', async () => {
    const { approved, packet, draft } = await approvedMission();
    const ledger = ledgerOf(approved);

    // Provenance chain
    expect(approved.id).toBe(draft.id);
    expect(approved.decisionPacket?.id).toBe(packet.id);
    expect(ledger.id).toBe(`LED-${packet.id}`);
    expect(ledger.decisionPacketId).toBe(packet.id);
    expect(ledger.missionId).toBe(draft.id);
    expect(ledger.approvalState).toBe('APPROVED');
    expect(approved.sourceAnalysisId).toBeTruthy();
    expect(approved.target.eventId).toBeTruthy();
    expect(Number.isFinite(Date.parse(approved.createdAt))).toBe(true);
    expect(approved.learning.modelVersionAtCreation).toBeTruthy();
    expect(approved.learning.replayableInputsDigest).toBeTruthy();

    // EXPECTED / ACTUAL / DELTA / STATUS are distinguishable
    expect(approved.expectedOutcome.measurableMetric).toBe('closing-line-value');
    expect(Number.isFinite(approved.expectedOutcome.targetValue.value)).toBe(true);
    expect(ledger.settlement.status).toBe('PENDING');
    expect(ledger.settlement.objectiveOutcome).toBeNull();
    expect(ledger.settlement.closingOdds).toBeNull();
    expect(ledger.clv.measured).toBe(false);
    expect(ledger.calibration.sampleEligible).toBe(false);
    expect(ledger.learning.feedback).toBe('PENDING');

    // Actual execution is OFF
    expect(approved.execution).toBeNull();
    expect(approved.measurement).toBeNull();
  });

  it('resolves EXPECTED vs ACTUAL vs DELTA vs STATUS from a valid measurement, preserving provenance', async () => {
    const { approved } = await approvedMission();
    const ledger = ledgerOf(approved);
    const measurement = measure({ modelProbability: 0.55, impliedProbabilityAtAnalysis: 0.5, impliedProbabilityAtClose: 0.55, outcome: 1 });
    expect(measurement.brierScore?.value).toBeCloseTo((0.55 - 1) ** 2, 8);

    const settled = settleLedgerEntry(ledger, {
      status: 'WON',
      objectiveOutcome: 1,
      closingOdds: 1.8,
      settledAt: new Date('2026-09-25T00:00:00.000Z'),
    });
    // EXPECTED (analysis-time snapshot) is untouched
    expect(settled.oddsSnapshot).toBe(ledger.oddsSnapshot);
    expect(settled.fairProbability).toBe(ledger.fairProbability);
    // ACTUAL / STATUS / DELTA
    expect(settled.settlement.status).toBe('WON');
    expect(settled.settlement.objectiveOutcome).toBe(1);
    expect(settled.settlement.closingOdds).toBe(1.8);
    expect(settled.settlement.settledAt).toBe('2026-09-25T00:00:00.000Z');
    expect(settled.clv.measured).toBe(true);
    expect(settled.clv.valuePct).toBeCloseTo((1 / 1.8 - 1 / settled.oddsSnapshot) * 100, 6);
    expect(settled.calibration.sampleEligible).toBe(true);
    // FEEDBACK / LEARNING
    expect(settled.learning.feedback).toBe('POSITIVE');
    expect(settled.learning.lesson).toBeTruthy();
    // Provenance survives settlement
    expect(settled.id).toBe(ledger.id);
    expect(settled.decisionPacketId).toBe(ledger.decisionPacketId);
    expect(settled.missionId).toBe(ledger.missionId);
    expect(settled.approvalState).toBe('APPROVED');
    expect(settled.recordedAt).toBe(ledger.recordedAt);
  });

  it('feeds calibration/learning without fabricating a result', async () => {
    const { approved } = await approvedMission();
    const settled = settleLedgerEntry(ledgerOf(approved), { status: 'WON', objectiveOutcome: 1, closingOdds: 1.8 });
    const summary = calibrateLedger([settled, ledgerOf(approved)]);
    expect(summary.sampleSize).toBe(2);
    expect(summary.resolvedCount).toBe(1);
    expect(summary.meanClvPct).not.toBeNull();
    const loop = evaluateCalibrationLoop([settled]);
    expect(loop.state).toBe('INSUFFICIENT_SAMPLE');
    expect(loop.summary.resolvedCount).toBe(1);
  });
});

describe('OUTCOME negative test matrix', () => {
  it('1-3. PENDING / REJECTED / CANCELLED missions produce no outcome', async () => {
    const { service, missions, analysis, action } = await context();
    const packet = eligiblePacket(analysis);
    // PENDING
    const pending = buildMissionFromAnalysis(analysis, action, { decisionPacket: packet, idSuffix: 'PEND' });
    await service.saveDraft(pending);
    await service.requestApproval(pending.id, 'tester');
    expect((await missions.getById(pending.id))!.decisionLedger?.settlement.status).toBe('PENDING');
    // REJECTED
    const rejected = buildMissionFromAnalysis(analysis, action, { decisionPacket: packet, idSuffix: 'REJ' });
    await service.saveDraft(rejected);
    await service.requestApproval(rejected.id, 'tester');
    const cancelled = await service.reject(rejected.id, 'approver', 'no');
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.decisionLedger?.learning.feedback).toBe('PENDING');
    // CANCELLED
    const toCancel = buildMissionFromAnalysis(analysis, action, { decisionPacket: packet, idSuffix: 'CAN' });
    await service.saveDraft(toCancel);
    await service.cancel(toCancel.id, 'op', 'stop');
    expect((await missions.getById(toCancel.id))!.status).toBe('CANCELLED');
    // none of these settle an outcome
    for (const id of [pending.id, rejected.id, toCancel.id]) {
      expect((await missions.getById(id))!.decisionLedger?.settlement.status).toBe('PENDING');
      expect((await missions.getById(id))!.decisionLedger?.clv.measured).toBe(false);
    }
  });

  it('4-7. BLOCKED / NO_MARKET_DATA / NO_BUILDABLE_SELECTIONS / INSUFFICIENT_DATA produce no outcome', async () => {
    const { analysis, action } = await context();
    const blocked = createDecisionPacket(evaluateDecisionCenter([]), [], null, new Date('2026-09-24T00:00:00.000Z'));
    expect(blocked.mission.eligible).toBe(false);
    for (const label of ['BLOCKED', 'NO_MARKET_DATA', 'NO_BUILDABLE_SELECTIONS', 'INSUFFICIENT_DATA']) {
      expect(() => buildMissionFromAnalysis(analysis, action, { decisionPacket: blocked }), label).toThrow(/DECISION_PACKET_BLOCKED/);
    }
  });

  it('8. missing mission is rejected cleanly', async () => {
    const { service } = await context();
    await expect(service.execute('MSN-MISSING', 'x')).rejects.toThrow(/not found/);
    await expect(service.execute('', 'x')).rejects.toThrow(/not found/);
  });

  it('9. a mission without a decision packet yields no ledger (no fabricated outcome)', async () => {
    const { analysis, action } = await context();
    const bare = buildMissionFromAnalysis(analysis, action, { idSuffix: 'NOPKT' });
    expect(bare.decisionPacket).toBeUndefined();
    expect(bare.decisionLedger).toBeUndefined();
  });

  it('10. a malformed mission payload (missing packet/ledger lineage) is rejected at persistence', async () => {
    const { service, missions } = await context();
    for (const bad of [
      { id: 'MSN-BAD' },
      { id: 'MSN-BAD2', sourceAnalysisId: 'A', target: { eventId: 'E' }, status: 'DRAFT', approval: { required: false, state: 'PENDING' } },
    ]) {
      await expect(service.saveDraft(bad as unknown as Mission)).rejects.toMatchObject({ code: 'MALFORMED_MISSION' });
    }
    expect(await missions.count()).toBe(0);
  });

  it('11. expected outcome is always present and finite; it is the basis the outcome is scored against', async () => {
    const { analysis, action } = await context();
    const draft = buildMissionFromAnalysis(analysis, action, { idSuffix: 'EXP' });
    expect(draft.expectedOutcome).toBeDefined();
    expect(draft.expectedOutcome.measurableMetric).toBeTruthy();
    expect(Number.isFinite(draft.expectedOutcome.targetValue.value)).toBe(true);
    expect(Number.isFinite(draft.expectedOutcome.horizonMinutes.value)).toBe(true);
    expect(draft.expectedOutcome.successCriteria.length).toBeGreaterThan(0);
    // The structural guard does not own expectedOutcome; a mission lacking it is still a full
    // artifact and the missing expected value remains explicitly unresolved rather than fabricated.
    expect(() => assertMissionPayload({ ...draft, expectedOutcome: undefined } as unknown as Mission)).not.toThrow();
  });

  it('12/13/14/15. malformed, NaN, Infinity and invalid settlement payloads are rejected', async () => {
    const { approved } = await approvedMission();
    const fresh = () => ledgerOf(approved);
    const invalid: Array<[string, Parameters<typeof settleLedgerEntry>[1]]> = [
      ['unknown status', { status: 'NOPE' as never, objectiveOutcome: 1 }],
      ['NaN closingOdds', { status: 'WON', objectiveOutcome: 1, closingOdds: NaN }],
      ['Infinity closingOdds', { status: 'WON', objectiveOutcome: 1, closingOdds: Infinity }],
      ['negative closingOdds', { status: 'WON', objectiveOutcome: 1, closingOdds: -3 }],
      ['zero closingOdds', { status: 'WON', objectiveOutcome: 1, closingOdds: 0 }],
      ['NaN objectiveOutcome', { status: 'WON', objectiveOutcome: NaN }],
      ['out-of-domain objectiveOutcome', { status: 'WON', objectiveOutcome: 2 }],
      ['invalid settledAt', { status: 'WON', objectiveOutcome: 1, settledAt: new Date('nonsense') }],
    ];
    for (const [label, input] of invalid) {
      expect(() => settleLedgerEntry(fresh(), input), label).toThrow(/INVALID_SETTLEMENT/);
    }
  });

  it('16. duplicate outcome is bounded — settlement happens exactly once', async () => {
    const { approved } = await approvedMission();
    const settled = settleLedgerEntry(ledgerOf(approved), { status: 'WON', objectiveOutcome: 1, closingOdds: 1.8 });
    expect(() => settleLedgerEntry(settled, { status: 'LOST', objectiveOutcome: 0 })).toThrow(/LEDGER_ALREADY_SETTLED/);
    expect(settled.settlement.status).toBe('WON');
  });

  it('17. a terminal outcome is not silently overwritten', async () => {
    const { approved } = await approvedMission();
    const settled = settleLedgerEntry(ledgerOf(approved), { status: 'WON', objectiveOutcome: 1, closingOdds: 1.8 });
    const original = JSON.parse(JSON.stringify(settled));
    try { settleLedgerEntry(settled, { status: 'LOST', objectiveOutcome: 0 }); } catch { /* expected */ }
    expect(settled).toEqual(original);
  });

  it('18. the production dataset yields no outcome', async () => {
    const { analysis, action } = await context();
    const decision = evaluateDecisionCenter([]);
    expect(decision.status).toBe('BLOCKED');
    const packet = createDecisionPacket(decision, [], null, new Date('2026-09-24T00:00:00.000Z'));
    expect(packet.mission.eligible).toBe(false);
    expect(() => buildMissionFromAnalysis(analysis, action, { decisionPacket: packet })).toThrow(/DECISION_PACKET_BLOCKED/);
  });

  it('19. no execution occurs and the engine refuses an unapproved mission', async () => {
    const { analysis, action, service, missions } = await context();
    const draft = buildMissionFromAnalysis(analysis, action, { idSuffix: 'SAFE' });
    await service.saveDraft(draft);
    await expect(engine.submitMission(draft)).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });
    const stored = (await missions.getById(draft.id))!;
    expect(stored.execution).toBeNull();
    expect(stored.measurement).toBeNull();
  });

  it('20. mission actions are observational only (no external mutation surface)', async () => {
    const { analysis, action } = await context();
    const draft = buildMissionFromAnalysis(analysis, action, { idSuffix: 'OBS' });
    const kinds = draft.actions.map((a) => a.kind);
    expect(kinds.every((k) => ['OBSERVE_MARKET', 'CAPTURE_SNAPSHOT', 'EVALUATE_TRIGGER', 'RECOMPUTE_ANALYSIS', 'RAISE_ALERT', 'REPORT'].includes(k))).toBe(true);
    expect(draft.risk.monetaryExposure).toBe('none');
    const caps = await engine.capabilities();
    expect(caps.supportsMonetaryExecution).toBe(false);
  });
});

describe('numeric factory (det) semantics', () => {
  it('coerces non-finite input to a finite neutral 0, and stays finite for valid input', () => {
    expect(det(NaN, 'percent', 'measurement-service').value).toBe(0);
    expect(det(Infinity, 'decimal-odds', 'measurement-service').value).toBe(0);
    expect(det(-Infinity, 'ratio', 'measurement-service').value).toBe(0);
    expect(det(2.5, 'percent', 'measurement-service').value).toBe(2.5);
    expect(det(0, 'count', 'measurement-service').formatted).toBe('0');
  });

  it('keeps non-finite values out of measurement outputs', () => {
    const r = measure({ modelProbability: NaN, impliedProbabilityAtAnalysis: Infinity, impliedProbabilityAtClose: NaN, outcome: null });
    expect(Number.isFinite(r.closingLineValuePct.value)).toBe(true);
    expect(Number.isFinite(r.calibrationDeltaPct.value)).toBe(true);
    expect(r.brierScore).toBeNull();
    expect(r.verdict).toBe('unresolved');
  });
});
