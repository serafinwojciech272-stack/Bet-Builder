import { det } from '../domain/numbers';
import { measure } from '../domain/services/measurementService';
import type { AnalysisResponse } from '../ai/contracts';
import type { ExecutionInfo, ExecutionStep, MeasurementInfo, Mission } from '../missions/types';
import type { OptimizationRequest, OptimizationResult } from '../core/types';
import { createMockCoreEngine } from '../core/mockCoreEngine';

export interface CoreEngineCapabilities {
  engineId: string;
  mode: 'mock' | 'live';
  version: string;
  supportsExecution: boolean;
  supportsMeasurement: boolean;
  supportsLearning: boolean;
  supportsPortfolioOptimization: boolean;
  supportsMonetaryExecution: false;
  notes: string;
}

export interface CoreEngineAck {
  accepted: boolean;
  engineRef: string;
  acceptedAt: string;
  rejectionReason?: string;
}

export class CoreEngineError extends Error {
  constructor(
    readonly code: 'APPROVAL_REQUIRED' | 'UNSUPPORTED_ACTION' | 'ENGINE_UNAVAILABLE',
    message: string,
  ) {
    super(message);
    this.name = 'CoreEngineError';
  }
}

/** Single Core Engine boundary for optimization, mission execution, measurement and learning. */
export interface CoreEngineClient {
  readonly engineId: string;
  readonly mode: 'mock' | 'live';
  capabilities(): Promise<CoreEngineCapabilities>;
  optimizeBuilder(request: OptimizationRequest): Promise<OptimizationResult>;
  submitMission(mission: Mission): Promise<CoreEngineAck>;
  executeMission(mission: Mission, analysis: AnalysisResponse | null): Promise<ExecutionInfo>;
  measureMission(mission: Mission, analysis: AnalysisResponse | null): Promise<MeasurementInfo>;
  publishLearning(mission: Mission): Promise<{ accepted: boolean; lessons: string[] }>;
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export class MockCoreEngineClient implements CoreEngineClient {
  readonly engineId = 'core-engine-mock';
  readonly mode = 'mock' as const;
  private readonly optimizer = createMockCoreEngine();

  constructor(private readonly options: { stepDelayMs?: number } = {}) {}

  async capabilities(): Promise<CoreEngineCapabilities> {
    await delay(80);
    return {
      engineId: this.engineId,
      mode: this.mode,
      version: '0.10.0-mock',
      supportsExecution: true,
      supportsMeasurement: true,
      supportsLearning: true,
      supportsPortfolioOptimization: true,
      supportsMonetaryExecution: false,
      notes: 'Simulated Core Engine. Execution is observational only; portfolio optimization is deterministic and auditable.',
    };
  }

  async optimizeBuilder(request: OptimizationRequest): Promise<OptimizationResult> {
    await delay(Math.min(500, this.options.stepDelayMs ?? 180));
    return this.optimizer.optimize(request);
  }

  async submitMission(mission: Mission): Promise<CoreEngineAck> {
    await delay(this.options.stepDelayMs ?? 260);
    if (mission.approval.state !== 'APPROVED') {
      throw new CoreEngineError('APPROVAL_REQUIRED', 'Core Engine rejected the mission: approval gate not satisfied.');
    }
    const unsupported = mission.actions.find((a) => !['OBSERVE_MARKET', 'CAPTURE_SNAPSHOT', 'EVALUATE_TRIGGER', 'RECOMPUTE_ANALYSIS', 'RAISE_ALERT', 'REPORT'].includes(a.kind));
    if (unsupported) throw new CoreEngineError('UNSUPPORTED_ACTION', `Action ${unsupported.kind} is not permitted by this engine.`);
    return { accepted: true, engineRef: `CE-${mission.id.slice(-8)}-${Date.now().toString(36).toUpperCase()}`, acceptedAt: new Date().toISOString() };
  }

  async executeMission(mission: Mission, analysis: AnalysisResponse | null): Promise<ExecutionInfo> {
    const ack = await this.submitMission(mission);
    const startedAt = new Date().toISOString();
    const steps: ExecutionStep[] = [];
    const observation = analysis?.marketObservations.find((o) => o.selectionId === mission.target.selectionId) ?? analysis?.marketObservations[0] ?? null;
    const threshold = mission.actions.find((a) => a.kind === 'EVALUATE_TRIGGER')?.trigger?.threshold.value ?? 3;
    const observedMove = Math.abs(observation?.changePct.value ?? 0);
    const triggerFired = observedMove >= threshold;
    const plan: Array<Pick<ExecutionStep, 'actionId' | 'label' | 'status' | 'detail'>> = [
      { actionId: 'act-observe', label: 'Observation window opened', status: 'ok', detail: `Watching ${mission.target.selectionLabel ?? mission.target.marketLabel} across ${mission.target.bookmakers.length} book(s).` },
      { actionId: 'act-capture', label: 'Snapshots captured', status: analysis?.dataQuality.stale ? 'warning' : 'ok', detail: analysis?.dataQuality.stale ? 'Captures succeeded but the upstream feed is stale; marked as degraded input.' : 'Canonical snapshots captured and normalized without loss.' },
      { actionId: 'act-trigger', label: triggerFired ? 'Trigger fired' : 'Trigger evaluated — not fired', status: triggerFired ? 'warning' : 'ok', detail: `Observed |Δ| ${observedMove.toFixed(2)}% against threshold ${threshold.toFixed(1)}%.` },
      { actionId: 'act-recompute', label: triggerFired ? 'Reassessment requested' : 'Reassessment not required', status: 'ok', detail: triggerFired ? 'Fresh intelligence pass queued for this market.' : 'Movement stayed inside the defined band; no reassessment queued.' },
      { actionId: 'act-alert', label: triggerFired ? 'Operator alert raised' : 'No alert necessary', status: 'ok', detail: triggerFired ? 'Alert emitted to the intelligence dashboard.' : 'Silent completion — nothing actionable observed.' },
      { actionId: 'act-report', label: 'Observation window closed', status: 'ok', detail: 'Handing off to measurement.' },
    ];
    for (const [i, p] of plan.entries()) {
      await delay(this.options.stepDelayMs ?? 260);
      steps.push({ id: `step-${i + 1}`, at: new Date().toISOString(), ...p });
    }
    return { startedAt, completedAt: new Date().toISOString(), engineRef: ack.engineRef, steps, observationsCount: det(steps.length, 'count', 'measurement-service'), triggerFired, triggerFiredAt: triggerFired ? steps[2].at : null, failureReason: null };
  }

  async measureMission(mission: Mission, analysis: AnalysisResponse | null): Promise<MeasurementInfo> {
    await delay(this.options.stepDelayMs ?? 260);
    const estimate = analysis?.probabilityEstimates.find((p) => p.selectionId === mission.target.selectionId) ?? analysis?.probabilityEstimates[0] ?? null;
    const observation = analysis?.marketObservations.find((o) => o.selectionId === mission.target.selectionId) ?? analysis?.marketObservations[0] ?? null;
    const impliedAtAnalysis = estimate?.impliedProbability.value ?? 0.5;
    const drift = observation ? observation.changePct.value / 100 : 0;
    const impliedAtClose = Math.max(0.01, Math.min(0.99, impliedAtAnalysis * (1 - drift)));
    const result = measure({ modelProbability: estimate?.modelProbability.value ?? 0.5, impliedProbabilityAtAnalysis: impliedAtAnalysis, impliedProbabilityAtClose: impliedAtClose, outcome: null });
    const objectiveMet = mission.expectedOutcome.measurableMetric === 'data-quality-score'
      ? (analysis?.dataQuality.score.value ?? 0) >= 0.6
      : Math.abs(result.closingLineValuePct.value) >= mission.expectedOutcome.targetValue.value * 0.5;
    return { measuredAt: new Date().toISOString(), verdict: result.verdict, closingLineValuePct: result.closingLineValuePct, closingOdds: det(1 / impliedAtClose, 'decimal-odds', 'measurement-service'), realizedMovementPct: result.realizedMovementPct, calibrationDeltaPct: result.calibrationDeltaPct, brierScore: result.brierScore, objectiveMet, notes: [`Reference implied probability at analysis: ${(impliedAtAnalysis * 100).toFixed(1)}%.`, `Measured implied probability at close: ${(impliedAtClose * 100).toFixed(1)}%.`, objectiveMet ? 'Mission objective met within the defined horizon.' : 'Mission objective not met — movement stayed inside the target band.'] };
  }

  async publishLearning(mission: Mission): Promise<{ accepted: boolean; lessons: string[] }> {
    await delay(140);
    const lessons: string[] = [];
    if (mission.measurement) {
      lessons.push(mission.measurement.verdict === 'beat-close'
        ? `Model led the market on ${mission.target.marketLabel}; the ${mission.learning.dataQualityGradeAtCreation}-grade feed was sufficient.`
        : mission.measurement.verdict === 'lost-to-close'
          ? `Market moved against the model read on ${mission.target.marketLabel}; review rating inputs for ${mission.target.leagueName}.`
          : `No decisive signal; keep ${mission.target.marketLabel} on observation-only footing.`);
      if (!mission.measurement.objectiveMet) lessons.push('Trigger threshold may be too wide for this liquidity profile.');
    }
    if (mission.execution?.steps.some((s) => s.status === 'warning')) lessons.push('Degraded inputs observed during execution — raise data-quality gate for similar missions.');
    return { accepted: true, lessons };
  }
}
