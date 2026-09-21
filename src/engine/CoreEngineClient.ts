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

export class LiveCoreEngineClient implements CoreEngineClient {
  readonly engineId = 'core-engine';
  readonly mode = 'live' as const;

  private async call(action: string, payload: Record<string, unknown> = {}) {
    const response = await fetch('/api/core-engine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }) });
    const body = await response.json().catch(() => ({ error: 'CORE_ENGINE_INVALID_RESPONSE' })) as Record<string, unknown>;
    if (!response.ok || body.ok === false) throw new CoreEngineError('ENGINE_UNAVAILABLE', String(body.error || 'Core Engine request failed.'));
    return body;
  }

  async capabilities(): Promise<CoreEngineCapabilities> {
    const response = await fetch('/api/core-engine', { cache: 'no-store' });
    const body = await response.json().catch(() => ({ error: 'CORE_ENGINE_INVALID_RESPONSE' })) as Record<string, unknown>;
    if (!response.ok || body.ok === false) throw new CoreEngineError('ENGINE_UNAVAILABLE', String(body.error || 'Core Engine unavailable.'));
    const capabilities = Array.isArray(body.capabilities) ? body.capabilities : [];
    return { engineId: 'core-engine', mode: 'live', version: String(body.version || 'unknown'), supportsExecution: capabilities.includes('execute'), supportsMeasurement: capabilities.includes('measure'), supportsLearning: capabilities.includes('learn'), supportsPortfolioOptimization: true, supportsMonetaryExecution: false, notes: 'Remote Core Engine governance is active; sports portfolio optimization remains domain-specific and deterministic.' };
  }

  async optimizeBuilder(request: OptimizationRequest): Promise<OptimizationResult> {
    return createMockCoreEngine().optimize(request);
  }

  async submitMission(mission: Mission): Promise<CoreEngineAck> {
    const submitted = await this.call('submit', { mission });
    const remoteMission = submitted.mission as Record<string, unknown> | undefined;
    const engineRef = String(remoteMission?.id || '');
    if (!engineRef) throw new CoreEngineError('ENGINE_UNAVAILABLE', 'Core Engine did not return a mission reference.');
    await this.call('approve', { engineRef });
    return { accepted: true, engineRef, acceptedAt: new Date().toISOString() };
  }

  async executeMission(mission: Mission, _analysis: AnalysisResponse | null): Promise<ExecutionInfo> {
    const ack = await this.submitMission(mission);
    const startedAt = new Date().toISOString();
    const result = await this.call('execute', { engineRef: ack.engineRef });
    const remoteMission = result.mission as Record<string, unknown> | undefined;
    const completedAt = new Date().toISOString();
    return { startedAt, completedAt, engineRef: ack.engineRef, steps: [{ id: 'core-engine-execute', at: completedAt, actionId: 'core-engine-execute', label: 'Core Engine observational execution', status: remoteMission?.state === 'EXECUTING' ? 'ok' : 'warning', detail: 'Remote Core Engine mission ' + ack.engineRef + ' entered ' + String(remoteMission?.state || 'UNKNOWN') + ' state.' }], observationsCount: det(1, 'count', 'core-engine'), triggerFired: false, triggerFiredAt: null, failureReason: null };
  }

  private outcomeFromAnalysis(analysis: AnalysisResponse | null) {
    const estimate = analysis?.probabilityEstimates[0];
    const observation = analysis?.marketObservations[0];
    const before = estimate?.impliedProbability.value ?? 0.5;
    const drift = observation ? observation.changePct.value / 100 : 0;
    const after = Math.max(0.01, Math.min(0.99, before * (1 - drift)));
    return { before, after, direction: 'higher' as const };
  }

  async measureMission(mission: Mission, analysis: AnalysisResponse | null): Promise<MeasurementInfo> {
    const engineRef = mission.execution?.engineRef;
    if (!engineRef) throw new CoreEngineError('ENGINE_UNAVAILABLE', 'Core Engine mission reference is missing.');
    const outcome = this.outcomeFromAnalysis(analysis);
    const result = await this.call('measure', { engineRef, outcome });
    const assessment = result.assessment as Record<string, unknown> | undefined;
    const improved = assessment?.improved === true;
    const negative = assessment?.quality === 'NEGATIVE';
    const estimate = analysis?.probabilityEstimates[0];
    const impliedAtAnalysis = estimate?.impliedProbability.value ?? outcome.before;
    const impliedAtClose = outcome.after;
    const closingLineValuePct = det(((impliedAtClose - impliedAtAnalysis) / Math.max(0.01, impliedAtAnalysis)) * 100, 'clv-percent', 'core-engine');
    return { measuredAt: new Date().toISOString(), verdict: improved ? 'beat-close' : negative ? 'lost-to-close' : 'unresolved', closingLineValuePct, closingOdds: det(1 / impliedAtClose, 'decimal-odds', 'core-engine'), realizedMovementPct: det((impliedAtClose - impliedAtAnalysis) * 100, 'movement-percent', 'core-engine'), calibrationDeltaPct: det((impliedAtClose - (estimate?.modelProbability.value ?? impliedAtAnalysis)) * 100, 'calibration-delta-percent', 'core-engine'), brierScore: null, objectiveMet: improved, notes: [String(assessment?.reason || 'Core Engine recorded the measurement.')] };
  }

  async publishLearning(mission: Mission): Promise<{ accepted: boolean; lessons: string[] }> {
    const engineRef = mission.execution?.engineRef;
    if (!engineRef || !mission.measurement) throw new CoreEngineError('ENGINE_UNAVAILABLE', 'Core Engine learning requires a measured mission.');
    const outcome = { before: 0, after: mission.measurement.closingLineValuePct.value, direction: 'higher' as const };
    await this.call('complete', { engineRef, outcome });
    const result = await this.call('learn', { engineRef, outcome });
    const learning = result.learning as Record<string, unknown> | undefined;
    const lesson = typeof learning?.lesson === 'string' ? learning.lesson : typeof learning?.reason === 'string' ? learning.reason : 'Core Engine learning recorded.';
    return { accepted: true, lessons: [lesson] };
  }
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
      version: '1.0.0-core-engine',
      supportsExecution: true,
      supportsMeasurement: true,
      supportsLearning: true,
      supportsPortfolioOptimization: true,
      supportsMonetaryExecution: false,
      notes: 'Core Engine 1.0 boundary. Decisioning is deterministic, freshness-aware, auditable and learning-ready; execution remains observational only with no monetary execution.',
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
