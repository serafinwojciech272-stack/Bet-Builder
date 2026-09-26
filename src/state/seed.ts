import type { AnalysisResponse } from '../ai/contracts';
import { measure } from '../domain/services/measurementService';
import { det } from '../domain/numbers';
import { buildMissionFromAnalysis } from '../missions/missionFactory';
import { createDecisionPacketFromAnalysis } from '../core/decisionPacket';
import { transition } from '../missions/stateMachine';
import type { ExecutionStep, Mission, MissionStatus } from '../missions/types';
import type { Workspace } from './services';

function minutesAgo(base: Date, minutes: number): Date {
  return new Date(base.getTime() - minutes * 60_000);
}

function acknowledgeChecklist(mission: Mission, at: string, actor: string): Mission {
  return {
    ...mission,
    approval: {
      ...mission.approval,
      checklist: mission.approval.checklist.map((c) => ({ ...c, acknowledged: true })),
      state: 'APPROVED',
      requestedAt: at,
      requestedBy: 'j.moreau',
      decidedAt: at,
      decidedBy: actor,
      note: 'Reviewed against the standing observation policy. No monetary action attached.',
      blockers: [],
    },
  };
}

function synthExecution(mission: Mission, analysis: AnalysisResponse, at: Date, triggerFired: boolean) {
  const labels: Array<[string, string, ExecutionStep['status'], string]> = [
    ['act-observe', 'Observation window opened', 'ok', `Watching ${mission.target.selectionLabel ?? mission.target.marketLabel}.`],
    ['act-capture', 'Snapshots captured', analysis.dataQuality.stale ? 'warning' : 'ok', analysis.dataQuality.stale ? 'Feed flagged stale during capture.' : 'Captures normalized without loss.'],
    ['act-trigger', triggerFired ? 'Trigger fired' : 'Trigger evaluated — not fired', triggerFired ? 'warning' : 'ok', `Threshold ${mission.expectedOutcome.targetValue.formatted}.`],
    ['act-recompute', triggerFired ? 'Reassessment requested' : 'Reassessment not required', 'ok', triggerFired ? 'Fresh intelligence pass queued.' : 'Movement inside band.'],
    ['act-report', 'Observation window closed', 'ok', 'Handed off to measurement.'],
  ];
  const steps: ExecutionStep[] = labels.map(([actionId, label, status, detail], i) => ({
    id: `step-${i + 1}`,
    at: new Date(at.getTime() + i * 4 * 60_000).toISOString(),
    actionId,
    label,
    status,
    detail,
  }));
  return {
    startedAt: at.toISOString(),
    completedAt: steps[steps.length - 1].at,
    engineRef: `CE-${mission.id.slice(-6)}-SEED`,
    steps,
    observationsCount: det(steps.length, 'count' as const, 'measurement-service' as const),
    triggerFired,
    triggerFiredAt: triggerFired ? steps[2].at : null,
    failureReason: null,
  };
}

function synthMeasurement(mission: Mission, analysis: AnalysisResponse, at: Date, outcome: 0 | 1 | null) {
  const estimate =
    analysis.probabilityEstimates.find((p) => p.selectionId === mission.target.selectionId) ??
    analysis.probabilityEstimates[0];
  const observation =
    analysis.marketObservations.find((o) => o.selectionId === mission.target.selectionId) ??
    analysis.marketObservations[0];
  const impliedAtAnalysis = estimate.impliedProbability.value || 0.5;
  const drift = observation ? observation.changePct.value / 100 : 0;
  const impliedAtClose = Math.max(0.02, Math.min(0.98, impliedAtAnalysis * (1 - drift * 1.4)));
  const result = measure({
    modelProbability: estimate.modelProbability.value,
    impliedProbabilityAtAnalysis: impliedAtAnalysis,
    impliedProbabilityAtClose: impliedAtClose,
    outcome,
  });
  return {
    measurement: {
      measuredAt: at.toISOString(),
      verdict: result.verdict,
      closingLineValuePct: result.closingLineValuePct,
      closingOdds: det(1 / impliedAtClose, 'decimal-odds', 'measurement-service'),
      realizedMovementPct: result.realizedMovementPct,
      calibrationDeltaPct: result.calibrationDeltaPct,
      brierScore: result.brierScore,
      objectiveMet: Math.abs(result.closingLineValuePct.value) >= mission.expectedOutcome.targetValue.value * 0.5,
      notes: [
        `Reference implied probability ${(impliedAtAnalysis * 100).toFixed(1)}% → close ${(impliedAtClose * 100).toFixed(1)}%.`,
        outcome === null ? 'Event unresolved at measurement time.' : outcome === 1 ? 'Observed selection occurred.' : 'Observed selection did not occur.',
      ],
    },
    result,
    estimate,
    impliedAtClose,
  };
}

export interface SeedResult {
  analyses: AnalysisResponse[];
  missions: Mission[];
}

interface SeedSpec {
  eventId: string;
  minutesAgo: number;
  targetStatus: MissionStatus;
  outcome?: 0 | 1 | null;
  actionIndex?: number;
}

const SEED_SPECS: SeedSpec[] = [
  { eventId: 'EVT-SOC-1001', minutesAgo: 96, targetStatus: 'AWAITING_APPROVAL' },
  { eventId: 'EVT-NFL-3001', minutesAgo: 210, targetStatus: 'APPROVED' },
  { eventId: 'EVT-BAS-2002', minutesAgo: 340, targetStatus: 'COMPLETED', outcome: 1 },
  { eventId: 'EVT-SOC-1003', minutesAgo: 420, targetStatus: 'COMPLETED', outcome: 0 },
  { eventId: 'EVT-NHL-4001', minutesAgo: 505, targetStatus: 'CANCELLED', actionIndex: 1 },
  { eventId: 'EVT-SOC-1002', minutesAgo: 615, targetStatus: 'FAILED' },
  { eventId: 'EVT-SOC-1004', minutesAgo: 150, targetStatus: 'DRAFT' },
];

/**
 * Builds a realistic operating history: prior analyses, resolved outcomes and
 * missions spread across the whole lifecycle. Uses the same factories and the
 * same state machine as live usage — nothing is hand-faked.
 */
export async function seedWorkspace(workspace: Workspace): Promise<SeedResult> {
  const now = new Date();
  const analyses: AnalysisResponse[] = [];
  const missions: Mission[] = [];

  for (const spec of SEED_SPECS) {
    const at = minutesAgo(now, spec.minutesAgo);
    const service = workspace.seedAnalysisService(at);
    let analysis: AnalysisResponse;
    try {
      analysis = await service.analyzeEvent({ eventId: spec.eventId, requestedBy: 'seed' });
    } catch {
      continue;
    }
    await workspace.analysisRepository.save(analysis);
    analyses.push(analysis);

    const action =
      analysis.recommendedActions[spec.actionIndex ?? 0] ?? analysis.recommendedActions[0];
    if (!action || !action.missionEligible) continue;

    const decisionPacket = createDecisionPacketFromAnalysis(
      analysis,
      new Date(at.getTime() + 5 * 60_000),
      analysis.valueSignals[0]?.selectionId ? [analysis.valueSignals[0].selectionId] : undefined,
    );
    let mission = buildMissionFromAnalysis(analysis, action, {
      now: at,
      createdBy: 'intelligence-layer',
      decisionPacket,
      idSuffix: spec.eventId.slice(-4),
    });

    const t1 = new Date(at.getTime() + 6 * 60_000).toISOString();
    if (spec.targetStatus !== 'DRAFT') {
      mission = {
        ...mission,
        approval: { ...mission.approval, requestedAt: t1, requestedBy: 'j.moreau' },
      };
      mission = transition(mission, 'AWAITING_APPROVAL', {
        actor: 'j.moreau',
        reason: 'Submitted to the approval gate',
        at: t1,
      });
    }

    if (spec.targetStatus === 'CANCELLED') {
      const t2 = new Date(at.getTime() + 18 * 60_000).toISOString();
      mission = {
        ...mission,
        approval: {
          ...mission.approval,
          state: 'REJECTED',
          decidedAt: t2,
          decidedBy: 'a.ferreira',
          note: 'Rejected: only two books quoting and the feed had already gone stale.',
        },
      };
      mission = transition(mission, 'CANCELLED', {
        actor: 'a.ferreira',
        reason: 'Rejected at the approval gate — insufficient book coverage',
        at: t2,
      });
    } else if (spec.targetStatus !== 'DRAFT' && spec.targetStatus !== 'AWAITING_APPROVAL') {
      const t2 = new Date(at.getTime() + 14 * 60_000).toISOString();
      mission = acknowledgeChecklist(mission, t2, 'a.ferreira');
      mission = transition(mission, 'APPROVED', {
        actor: 'a.ferreira',
        reason: 'Approved at the gate — observation only',
        at: t2,
      });

      if (spec.targetStatus !== 'APPROVED') {
        const t3 = new Date(at.getTime() + 20 * 60_000);
        mission = transition(mission, 'EXECUTING', {
          actor: 'core-engine',
          reason: 'Dispatched to Core Engine (mock)',
          at: t3.toISOString(),
        });

        if (spec.targetStatus === 'FAILED') {
          mission = {
            ...mission,
            execution: {
              ...synthExecution(mission, analysis, t3, false),
              failureReason: 'Feed adapter dropped mid-window: two consecutive capture ticks returned no quotes.',
              completedAt: new Date(t3.getTime() + 9 * 60_000).toISOString(),
            },
          };
          mission = transition(mission, 'FAILED', {
            actor: 'core-engine',
            reason: 'Execution aborted — feed adapter failure',
            at: new Date(t3.getTime() + 9 * 60_000).toISOString(),
          });
        } else {
          const triggerFired = Math.abs(analysis.marketObservations[0]?.changePct.value ?? 0) >= 3;
          mission = { ...mission, execution: synthExecution(mission, analysis, t3, triggerFired) };
          const t4 = new Date(t3.getTime() + 26 * 60_000);
          mission = transition(mission, 'MEASURING', {
            actor: 'core-engine',
            reason: 'Observation window closed',
            at: t4.toISOString(),
          });
          const { measurement, result, estimate, impliedAtClose } = synthMeasurement(
            mission,
            analysis,
            t4,
            spec.outcome ?? null,
          );
          mission = { ...mission, measurement };
          const t5 = new Date(t4.getTime() + 8 * 60_000);
          mission = transition(mission, 'COMPLETED', {
            actor: 'core-engine',
            reason: measurement.objectiveMet ? 'Objective met' : 'Horizon elapsed',
            at: t5.toISOString(),
          });
          mission = {
            ...mission,
            learning: {
              ...mission.learning,
              version: 2,
              outcomeFeedback: measurement.objectiveMet
                ? 'confirmed'
                : measurement.verdict === 'lost-to-close'
                  ? 'contradicted'
                  : 'inconclusive',
              lessons: [
                measurement.verdict === 'beat-close'
                  ? `Model led the close on ${mission.target.marketLabel} by ${measurement.closingLineValuePct.formatted}.`
                  : measurement.verdict === 'lost-to-close'
                    ? `Market outpaced the model by ${measurement.closingLineValuePct.formatted}; review ${mission.target.leagueName} priors.`
                    : 'Close matched the analysis-time reference; no calibration change required.',
                `Feed grade at creation was ${mission.learning.dataQualityGradeAtCreation}.`,
              ],
            },
          };

          if (spec.outcome !== undefined && spec.outcome !== null) {
            await workspace.analysisRepository.attachOutcome(analysis.analysisId, {
              resolvedAt: t5.toISOString(),
              selectionId: estimate.selectionId,
              selectionLabel: estimate.label,
              outcome: spec.outcome,
              measurement: result,
              note: `Settled at an implied ${(impliedAtClose * 100).toFixed(1)}% close.`,
            });
          }
        }
      }
    }

    await workspace.missionService.saveDraft(mission);
    missions.push(mission);
  }

  return { analyses, missions };
}
