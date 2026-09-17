import { det } from '../domain/numbers';
import type { AnalysisResponse, RecommendedAction } from '../ai/contracts';
import type {
  ApprovalCheck,
  Mission,
  MissionAction,
  MissionExpectedOutcome,
  MissionRisk,
  MissionTarget,
  MissionType,
} from './types';

export interface MissionDraftOptions {
  /** Movement threshold (in %) that triggers a reassessment. */
  movementThresholdPct?: number;
  /** Observation cadence in minutes. */
  intervalMinutes?: number;
  horizonMinutes?: number;
  selectionId?: string | null;
  createdBy?: string;
  now?: Date;
  idSuffix?: string;
}

function actionKindToMissionType(kind: RecommendedAction['kind']): MissionType {
  switch (kind) {
    case 'REASSESS_ON_MOVEMENT':
      return 'REASSESS_ON_MOVEMENT';
    case 'DATA_QUALITY_WATCH':
      return 'DATA_QUALITY_WATCH';
    case 'VALUE_CONFIRMATION':
      return 'VALUE_CONFIRMATION';
    case 'CORRELATION_GUARD':
      return 'CORRELATION_GUARD';
    default:
      return 'MONITOR_MARKET';
  }
}

function missionId(analysis: AnalysisResponse, type: MissionType, suffix: string): string {
  return `MSN-${analysis.eventId.replace('EVT-', '')}-${type.split('_')[0]}-${suffix}`;
}

/**
 * Turns an AI recommendation into a *proposed* mission.
 * The mission is always born in DRAFT with a pending, mandatory approval gate
 * and can never contain a money-moving action.
 */
export function buildMissionFromAnalysis(
  analysis: AnalysisResponse,
  action: RecommendedAction,
  options: MissionDraftOptions = {},
): Mission {
  const now = options.now ?? new Date();
  const iso = now.toISOString();
  const type = actionKindToMissionType(action.kind);
  const threshold = options.movementThresholdPct ?? action.trigger?.threshold.value ?? 3;
  const interval = options.intervalMinutes ?? 15;
  const horizon = options.horizonMinutes ?? 180;

  const focusSelectionId =
    options.selectionId ??
    [...analysis.valueSignals].sort(
      (a, b) => b.qualityAdjustedEdgePct.value - a.qualityAdjustedEdgePct.value,
    )[0]?.selectionId ??
    null;
  const focus = analysis.valueSignals.find((v) => v.selectionId === focusSelectionId) ?? null;
  const observation = analysis.marketObservations.find((o) => o.selectionId === focusSelectionId) ?? null;

  const target: MissionTarget = {
    eventId: analysis.eventId,
    eventLabel: analysis.context.eventLabel,
    leagueName: analysis.context.leagueName,
    market: analysis.context.market,
    marketLabel: analysis.context.marketLabel,
    selectionId: focusSelectionId,
    selectionLabel: focus?.label ?? observation?.label ?? null,
    bookmakers: [...new Set(analysis.sourceSnapshots.map((s) => s.bookmaker))],
    startTime: analysis.context.startTime,
  };

  const actions: MissionAction[] = [
    {
      id: 'act-observe',
      kind: 'OBSERVE_MARKET',
      description: `Observe ${target.selectionLabel ?? target.marketLabel} across ${target.bookmakers.length} book(s).`,
      intervalMinutes: det(interval, 'minutes', 'movement-service'),
    },
    {
      id: 'act-capture',
      kind: 'CAPTURE_SNAPSHOT',
      description: 'Capture a canonical odds snapshot at each observation tick.',
      intervalMinutes: det(interval, 'minutes', 'movement-service'),
    },
    {
      id: 'act-trigger',
      kind: 'EVALUATE_TRIGGER',
      description: `Evaluate trigger: price movement ≥ ${threshold.toFixed(1)}% from the analysis-time reference.`,
      trigger: {
        metric: action.trigger?.metric ?? 'odds-change-pct',
        comparator: action.trigger?.comparator ?? 'gte',
        threshold: det(threshold, 'percent', 'movement-service'),
        description: `Fires when |Δ price| ≥ ${threshold.toFixed(1)}%`,
      },
    },
    {
      id: 'act-recompute',
      kind: 'RECOMPUTE_ANALYSIS',
      description: 'On trigger, request a fresh intelligence pass for this market.',
    },
    {
      id: 'act-alert',
      kind: 'RAISE_ALERT',
      description: 'Raise an operator alert summarising what changed and why it matters.',
    },
    {
      id: 'act-report',
      kind: 'REPORT',
      description: 'Emit a measurement report for the learning loop when the horizon elapses.',
    },
  ];

  if (type === 'DATA_QUALITY_WATCH') {
    actions[2] = {
      id: 'act-trigger',
      kind: 'EVALUATE_TRIGGER',
      description: 'Evaluate trigger: data-quality score drops below 0.60 or feed exceeds 10 minutes of age.',
      trigger: {
        metric: 'data-quality-score',
        comparator: 'lte',
        threshold: det(0.6, 'ratio', 'data-quality-service'),
        description: 'Fires when feed quality degrades below the usable threshold',
      },
    };
  }

  const risk: MissionRisk = {
    level: analysis.riskAssessment.level,
    score: analysis.riskAssessment.score,
    correlationLevel: analysis.correlationAssessment.level,
    correlationScore: analysis.correlationAssessment.score,
    notes: [
      analysis.riskAssessment.interpretation,
      analysis.correlationAssessment.interpretation,
      'Mission is observational: no stake, order or monetary instruction is produced.',
    ],
    monetaryExposure: 'none',
  };

  const expectedOutcome: MissionExpectedOutcome = {
    statement:
      type === 'DATA_QUALITY_WATCH'
        ? `Establish whether ${target.marketLabel} data becomes reliable enough to support a conclusion within ${horizon} minutes.`
        : `Determine whether the ${focus ? focus.edgePct.formatted : 'observed'} divergence on ${target.selectionLabel ?? target.marketLabel} persists, strengthens or decays before start.`,
    successCriteria: [
      `At least ${Math.max(2, Math.round(horizon / interval / 2))} clean snapshots captured inside the horizon.`,
      `Trigger evaluation recorded for every observation tick.`,
      type === 'DATA_QUALITY_WATCH'
        ? 'Feed quality grade re-scored at the end of the horizon.'
        : 'Closing-line value measured against the analysis-time reference price.',
      'A measurement record is written back to the learning loop.',
    ],
    measurableMetric:
      type === 'DATA_QUALITY_WATCH'
        ? 'data-quality-score'
        : type === 'VALUE_CONFIRMATION'
          ? 'edge-persistence'
          : 'closing-line-value',
    targetValue: det(threshold, 'percent', 'movement-service'),
    horizonMinutes: det(horizon, 'minutes', 'risk-service'),
  };

  const checklist: ApprovalCheck[] = [
    {
      id: 'chk-no-money',
      label: 'No monetary execution',
      detail: 'Confirmed: mission actions are observational only — no stake or order is generated.',
      required: true,
      acknowledged: false,
    },
    {
      id: 'chk-data-quality',
      label: `Data quality reviewed (grade ${analysis.dataQuality.grade})`,
      detail: `Score ${(analysis.dataQuality.score.value * 100).toFixed(0)}/100, freshness ${analysis.dataQuality.freshnessMinutes.formatted}, coverage ${(analysis.dataQuality.bookmakerCoverage.value * 100).toFixed(0)}%.`,
      required: true,
      acknowledged: false,
    },
    {
      id: 'chk-risk',
      label: `Risk accepted (${analysis.riskAssessment.level})`,
      detail: analysis.riskAssessment.interpretation,
      required: true,
      acknowledged: false,
    },
    {
      id: 'chk-correlation',
      label: `Correlation reviewed (${analysis.correlationAssessment.level})`,
      detail: analysis.correlationAssessment.interpretation,
      required: analysis.correlationAssessment.level !== 'ISOLATED',
      acknowledged: false,
    },
    {
      id: 'chk-assumptions',
      label: 'AI assumptions acknowledged',
      detail: `${analysis.assumptions.length} assumptions declared by the intelligence layer.`,
      required: false,
      acknowledged: false,
    },
  ];

  const blockers: string[] = [];
  if (analysis.dataQuality.grade === 'D') {
    blockers.push('Data quality grade D — mission cannot be approved on unreliable inputs.');
  }
  if (analysis.riskAssessment.level === 'HIGH' && type !== 'DATA_QUALITY_WATCH') {
    blockers.push('Risk level HIGH — only a data-quality watch may be approved for this market.');
  }

  return {
    id: missionId(analysis, type, options.idSuffix ?? String(now.getTime()).slice(-6)),
    type,
    createdAt: iso,
    updatedAt: iso,
    sourceAnalysisId: analysis.analysisId,
    target,
    objective: action.title,
    rationale: [
      action.detail,
      analysis.summary.headline,
      focus
        ? focus.commentary
        : 'No value signal attached; mission is purely observational.',
      `Confidence ${(analysis.confidence.score.value * 100).toFixed(0)}% (${analysis.confidence.band}).`,
    ],
    actions,
    risk,
    expectedOutcome,
    status: 'DRAFT',
    approval: {
      required: true,
      state: 'PENDING',
      requestedAt: null,
      requestedBy: null,
      decidedAt: null,
      decidedBy: null,
      note: null,
      checklist,
      blockers,
    },
    execution: null,
    measurement: null,
    learning: {
      version: 1,
      tags: [
        analysis.context.sportLabel.toLowerCase(),
        analysis.context.market,
        type.toLowerCase(),
        `stance:${analysis.summary.stance}`,
      ],
      lessons: [],
      modelVersionAtCreation: analysis.meta.modelVersion,
      dataQualityGradeAtCreation: analysis.dataQuality.grade,
      confidenceAtCreation: analysis.confidence.score,
      outcomeFeedback: 'pending',
      replayableInputsDigest: analysis.meta.deterministicInputsDigest,
    },
    history: [
      {
        from: null,
        to: 'DRAFT',
        at: iso,
        actor: options.createdBy ?? 'intelligence-layer',
        reason: `Proposed from analysis ${analysis.analysisId}`,
      },
    ],
  };
}
