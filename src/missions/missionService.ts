import type { AnalysisRepository } from '../ai/AnalysisRepository';
import type { CoreEngineClient } from '../engine/CoreEngineClient';
import type { MissionRepository } from './MissionRepository';
import { transition } from './stateMachine';
import type { Mission } from './types';

/**
 * Orchestrates the post-intelligence half of the pipeline:
 * Mission -> Approval Gate -> Execution -> Measurement -> Learning.
 */
export class MissionService {
  constructor(
    private readonly missions: MissionRepository,
    private readonly analyses: AnalysisRepository,
    private readonly engine: CoreEngineClient,
  ) {}

  async saveDraft(mission: Mission): Promise<Mission> {
    return this.missions.save(mission);
  }

  async toggleChecklistItem(missionId: string, checkId: string, actor: string): Promise<Mission> {
    const mission = await this.requireMission(missionId);
    const updated: Mission = {
      ...mission,
      updatedAt: new Date().toISOString(),
      approval: {
        ...mission.approval,
        checklist: mission.approval.checklist.map((c) =>
          c.id === checkId ? { ...c, acknowledged: !c.acknowledged } : c,
        ),
        note: mission.approval.note,
        requestedBy: mission.approval.requestedBy ?? actor,
      },
    };
    return this.missions.save(updated);
  }

  async requestApproval(missionId: string, actor: string): Promise<Mission> {
    const mission = await this.requireMission(missionId);
    const at = new Date().toISOString();
    const staged: Mission = {
      ...mission,
      approval: {
        ...mission.approval,
        state: 'PENDING',
        requestedAt: at,
        requestedBy: actor,
      },
    };
    const moved = transition(staged, 'AWAITING_APPROVAL', {
      actor,
      reason: 'Submitted to the approval gate',
      at,
    });
    return this.missions.save(moved);
  }

  async approve(missionId: string, actor: string, note: string): Promise<Mission> {
    const mission = await this.requireMission(missionId);
    const at = new Date().toISOString();
    const decided: Mission = {
      ...mission,
      approval: {
        ...mission.approval,
        state: 'APPROVED',
        decidedAt: at,
        decidedBy: actor,
        note: note || 'Approved without additional notes.',
      },
    };
    const moved = transition(decided, 'APPROVED', {
      actor,
      reason: note || 'Approved at the gate',
      at,
    });
    return this.missions.save(moved);
  }

  async reject(missionId: string, actor: string, note: string): Promise<Mission> {
    const mission = await this.requireMission(missionId);
    const at = new Date().toISOString();
    const decided: Mission = {
      ...mission,
      approval: {
        ...mission.approval,
        state: 'REJECTED',
        decidedAt: at,
        decidedBy: actor,
        note: note || 'Rejected at the gate.',
      },
    };
    const moved = transition(decided, 'CANCELLED', {
      actor,
      reason: note || 'Rejected at the approval gate',
      at,
    });
    return this.missions.save(moved);
  }

  async cancel(missionId: string, actor: string, reason: string): Promise<Mission> {
    const mission = await this.requireMission(missionId);
    return this.missions.save(
      transition(mission, 'CANCELLED', { actor, reason: reason || 'Cancelled by operator' }),
    );
  }

  /** Execution is only reachable through an APPROVED mission. */
  async execute(missionId: string, actor: string): Promise<Mission> {
    const mission = await this.requireMission(missionId);
    const analysis = (await this.analyses.getById(mission.sourceAnalysisId))?.analysis ?? null;

    let working = transition(mission, 'EXECUTING', {
      actor,
      reason: 'Dispatched to Core Engine (mock)',
    });
    working = await this.missions.save(working);

    try {
      const execution = await this.engine.executeMission(working, analysis);
      working = await this.missions.save({ ...working, execution, updatedAt: execution.completedAt ?? working.updatedAt });
    } catch (error) {
      const failed = transition(working, 'FAILED', {
        actor: 'core-engine',
        reason: error instanceof Error ? error.message : 'Execution failed',
      });
      return this.missions.save({
        ...failed,
        execution: {
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          engineRef: 'n/a',
          steps: [],
          observationsCount: mission.expectedOutcome.targetValue,
          triggerFired: false,
          triggerFiredAt: null,
          failureReason: error instanceof Error ? error.message : 'Execution failed',
        },
      });
    }

    working = await this.missions.save(
      transition(working, 'MEASURING', { actor: 'core-engine', reason: 'Observation window closed' }),
    );

    const measurement = await this.engine.measureMission(working, analysis);
    working = await this.missions.save({ ...working, measurement });

    const learning = await this.engine.publishLearning(working);
    const completed = transition(working, 'COMPLETED', {
      actor: 'core-engine',
      reason: measurement.objectiveMet ? 'Objective met' : 'Horizon elapsed',
    });

    return this.missions.save({
      ...completed,
      learning: {
        ...completed.learning,
        version: completed.learning.version + 1,
        lessons: learning.lessons,
        outcomeFeedback: measurement.objectiveMet
          ? 'confirmed'
          : measurement.verdict === 'lost-to-close'
            ? 'contradicted'
            : 'inconclusive',
      },
    });
  }

  private async requireMission(missionId: string): Promise<Mission> {
    const mission = await this.missions.getById(missionId);
    if (!mission) throw new Error(`Mission ${missionId} not found`);
    return mission;
  }
}
