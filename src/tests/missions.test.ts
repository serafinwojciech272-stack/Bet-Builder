import { beforeEach, describe, expect, it } from 'vitest';
import { analyzeFixture } from './helpers';
import { buildMissionFromAnalysis } from '../missions/missionFactory';
import {
  MissionTransitionError,
  assertGuards,
  canTransition,
  nextStatuses,
  transition,
} from '../missions/stateMachine';
import { InMemoryMissionRepository } from '../missions/MissionRepository';
import { InMemoryAnalysisRepository } from '../ai/AnalysisRepository';
import { MissionService } from '../missions/missionService';
import { CoreEngineError, MockCoreEngineClient } from '../engine/CoreEngineClient';
import type { AnalysisResponse } from '../ai/contracts';
import type { Mission } from '../missions/types';

let analysis: AnalysisResponse;

beforeEach(async () => {
  analysis = await analyzeFixture();
});

function draft(): Mission {
  const action = analysis.recommendedActions.find((a) => a.missionEligible)!;
  return buildMissionFromAnalysis(analysis, action, {
    movementThresholdPct: 3,
    intervalMinutes: 15,
    horizonMinutes: 180,
    idSuffix: 'TEST',
  });
}

function acknowledgeAll(mission: Mission): Mission {
  return {
    ...mission,
    approval: {
      ...mission.approval,
      state: 'APPROVED',
      decidedAt: new Date().toISOString(),
      decidedBy: 'tester',
      note: 'ok',
      blockers: [],
      checklist: mission.approval.checklist.map((c) => ({ ...c, acknowledged: true })),
    },
  };
}

describe('mission creation from an analysis', () => {
  it('creates a DRAFT mission wired to the source analysis', () => {
    const mission = draft();
    expect(mission.status).toBe('DRAFT');
    expect(mission.sourceAnalysisId).toBe(analysis.analysisId);
    expect(mission.target.eventId).toBe(analysis.eventId);
    expect(mission.approval.required).toBe(true);
    expect(mission.approval.state).toBe('PENDING');
    expect(mission.history).toHaveLength(1);
    expect(mission.history[0].to).toBe('DRAFT');
    expect(mission.execution).toBeNull();
    expect(mission.measurement).toBeNull();
    expect(mission.learning.outcomeFeedback).toBe('pending');
  });

  it('never contains a money-moving action and declares zero exposure', () => {
    const mission = draft();
    const allowed = [
      'OBSERVE_MARKET',
      'CAPTURE_SNAPSHOT',
      'EVALUATE_TRIGGER',
      'RECOMPUTE_ANALYSIS',
      'RAISE_ALERT',
      'REPORT',
    ];
    expect(mission.actions.length).toBeGreaterThan(3);
    expect(mission.actions.every((a) => allowed.includes(a.kind))).toBe(true);
    expect(mission.risk.monetaryExposure).toBe('none');
  });

  it('carries the configured trigger threshold into the mission actions', () => {
    const action = analysis.recommendedActions.find((a) => a.missionEligible)!;
    const mission = buildMissionFromAnalysis(analysis, action, { movementThresholdPct: 4.5 });
    const trigger = mission.actions.find((a) => a.kind === 'EVALUATE_TRIGGER')!.trigger!;
    expect(trigger.threshold.value).toBe(4.5);
    expect(trigger.threshold.provenance).toBe('deterministic');
  });

  it('records learning metadata from the analysis snapshot', () => {
    const mission = draft();
    expect(mission.learning.modelVersionAtCreation).toBe(analysis.meta.modelVersion);
    expect(mission.learning.dataQualityGradeAtCreation).toBe(analysis.dataQuality.grade);
    expect(mission.learning.replayableInputsDigest).toBe(analysis.meta.deterministicInputsDigest);
  });
});

describe('mission state machine', () => {
  it('declares the legal transition table', () => {
    expect(canTransition('DRAFT', 'AWAITING_APPROVAL')).toBe(true);
    expect(canTransition('DRAFT', 'EXECUTING')).toBe(false);
    expect(canTransition('AWAITING_APPROVAL', 'APPROVED')).toBe(true);
    expect(canTransition('COMPLETED', 'EXECUTING')).toBe(false);
  });

  it('blocks execution while approval is pending', () => {
    const mission = transition(draft(), 'AWAITING_APPROVAL', { actor: 't', reason: 'submit' });
    expect(() => assertGuards(mission, 'APPROVED')).toThrowError(MissionTransitionError);
    try {
      assertGuards(mission, 'APPROVED');
    } catch (e) {
      expect((e as MissionTransitionError).code).toBe('APPROVAL_REQUIRED');
    }
  });

  it('blocks approval while mandatory checks are outstanding', () => {
    let mission = transition(draft(), 'AWAITING_APPROVAL', { actor: 't', reason: 'submit' });
    mission = {
      ...mission,
      approval: { ...mission.approval, state: 'APPROVED', checklist: mission.approval.checklist },
    };
    try {
      assertGuards(mission, 'APPROVED');
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as MissionTransitionError).code).toBe('CHECKLIST_INCOMPLETE');
    }
  });

  it('allows the full happy path once the gate is satisfied', () => {
    let mission = transition(draft(), 'AWAITING_APPROVAL', { actor: 't', reason: 'submit' });
    mission = acknowledgeAll(mission);
    mission = transition(mission, 'APPROVED', { actor: 'approver', reason: 'ok' });
    expect(mission.status).toBe('APPROVED');
    expect(nextStatuses(mission)).toContain('EXECUTING');

    mission = transition(mission, 'EXECUTING', { actor: 'engine', reason: 'dispatch' });
    expect(() => assertGuards(mission, 'MEASURING')).toThrowError(/never executed/);

    mission = {
      ...mission,
      execution: {
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        engineRef: 'CE-TEST',
        steps: [],
        observationsCount: mission.expectedOutcome.targetValue,
        triggerFired: false,
        triggerFiredAt: null,
        failureReason: null,
      },
    };
    mission = transition(mission, 'MEASURING', { actor: 'engine', reason: 'window closed' });
    expect(() => assertGuards(mission, 'COMPLETED')).toThrowError(/measurement/i);
  });

  it('refuses transitions out of terminal states', () => {
    let mission = transition(draft(), 'CANCELLED', { actor: 't', reason: 'abandoned' });
    expect(mission.status).toBe('CANCELLED');
    expect(nextStatuses(mission)).toHaveLength(0);
    expect(() => transition(mission, 'AWAITING_APPROVAL', { actor: 't', reason: 'nope' })).toThrowError(
      MissionTransitionError,
    );
    mission = { ...mission };
    expect(mission.history.at(-1)?.to).toBe('CANCELLED');
  });

  it('keeps transitions immutable and appends history', () => {
    const base = draft();
    const moved = transition(base, 'AWAITING_APPROVAL', { actor: 't', reason: 'submit' });
    expect(base.status).toBe('DRAFT');
    expect(base.history).toHaveLength(1);
    expect(moved.history).toHaveLength(2);
    expect(moved.history[1].from).toBe('DRAFT');
  });
});

describe('approval gate + Core Engine client', () => {
  it('rejects an unapproved mission at the engine boundary', async () => {
    const engine = new MockCoreEngineClient({ stepDelayMs: 0 });
    const mission = draft();
    await expect(engine.submitMission(mission)).rejects.toBeInstanceOf(CoreEngineError);
  });

  it('never advertises monetary execution capability', async () => {
    const engine = new MockCoreEngineClient({ stepDelayMs: 0 });
    const caps = await engine.capabilities();
    expect(caps.supportsMonetaryExecution).toBe(false);
    expect(caps.supportsMeasurement).toBe(true);
  });

  it('runs the mission service end-to-end through approval, execution and measurement', async () => {
    const missionRepo = new InMemoryMissionRepository();
    const analysisRepo = new InMemoryAnalysisRepository();
    await analysisRepo.save(analysis);
    const service = new MissionService(
      missionRepo,
      analysisRepo,
      new MockCoreEngineClient({ stepDelayMs: 0 }),
    );

    const mission = await service.saveDraft(draft());
    await service.requestApproval(mission.id, 'tester');
    let current = (await missionRepo.getById(mission.id))!;
    expect(current.status).toBe('AWAITING_APPROVAL');

    // Execution must be impossible before the gate clears.
    await expect(service.execute(mission.id, 'tester')).rejects.toThrowError(MissionTransitionError);

    for (const check of current.approval.checklist) {
      await service.toggleChecklistItem(mission.id, check.id, 'tester');
    }
    await service.approve(mission.id, 'approver', 'observation only');
    current = (await missionRepo.getById(mission.id))!;
    expect(current.status).toBe('APPROVED');
    expect(current.approval.state).toBe('APPROVED');
    expect(current.approval.decidedBy).toBe('approver');

    const completed = await service.execute(mission.id, 'approver');
    expect(completed.status).toBe('COMPLETED');
    expect(completed.execution?.steps.length).toBeGreaterThan(3);
    expect(completed.measurement).not.toBeNull();
    expect(completed.learning.version).toBe(2);
    expect(['confirmed', 'contradicted', 'inconclusive']).toContain(
      completed.learning.outcomeFeedback,
    );
    expect(completed.history.map((h) => h.to)).toEqual([
      'DRAFT',
      'AWAITING_APPROVAL',
      'APPROVED',
      'EXECUTING',
      'MEASURING',
      'COMPLETED',
    ]);
  });

  it('cancels a mission when rejected at the gate', async () => {
    const missionRepo = new InMemoryMissionRepository();
    const analysisRepo = new InMemoryAnalysisRepository();
    await analysisRepo.save(analysis);
    const service = new MissionService(
      missionRepo,
      analysisRepo,
      new MockCoreEngineClient({ stepDelayMs: 0 }),
    );
    const mission = await service.saveDraft(draft());
    await service.requestApproval(mission.id, 'tester');
    const rejected = await service.reject(mission.id, 'approver', 'thin coverage');
    expect(rejected.status).toBe('CANCELLED');
    expect(rejected.approval.state).toBe('REJECTED');
    expect(rejected.approval.note).toBe('thin coverage');
  });
});
