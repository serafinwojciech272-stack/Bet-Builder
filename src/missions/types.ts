import type { DeterministicNumber, MarketKey } from '../domain/types';
import type { DecisionPacket } from '../core/decisionPacket';

export type MissionStatus =
  | 'DRAFT'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'EXECUTING'
  | 'MEASURING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type MissionType =
  | 'MONITOR_MARKET'
  | 'REASSESS_ON_MOVEMENT'
  | 'DATA_QUALITY_WATCH'
  | 'VALUE_CONFIRMATION'
  | 'CORRELATION_GUARD';

/**
 * Deliberately excludes any staking / order-placement verb.
 * The platform never executes real-money actions.
 */
export type MissionActionKind =
  | 'OBSERVE_MARKET'
  | 'CAPTURE_SNAPSHOT'
  | 'EVALUATE_TRIGGER'
  | 'RECOMPUTE_ANALYSIS'
  | 'RAISE_ALERT'
  | 'REPORT';

export interface MissionTrigger {
  metric: 'odds-change-pct' | 'data-quality-score' | 'time-to-start-minutes' | 'edge-pct';
  comparator: 'gte' | 'lte';
  threshold: DeterministicNumber;
  description: string;
}

export interface MissionAction {
  id: string;
  kind: MissionActionKind;
  description: string;
  /** Wall-clock cadence in minutes for recurring observation actions. */
  intervalMinutes?: DeterministicNumber;
  trigger?: MissionTrigger;
}

export interface MissionTarget {
  eventId: string;
  eventLabel: string;
  leagueName: string;
  market: MarketKey;
  marketLabel: string;
  selectionId: string | null;
  selectionLabel: string | null;
  bookmakers: string[];
  startTime: string;
}

export interface MissionRisk {
  level: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH';
  score: DeterministicNumber;
  correlationLevel: 'ISOLATED' | 'LOW' | 'MODERATE' | 'HIGH';
  correlationScore: DeterministicNumber;
  notes: string[];
  /** Hard guard rail: monitoring missions can never place stakes. */
  monetaryExposure: 'none';
}

export interface MissionExpectedOutcome {
  statement: string;
  successCriteria: string[];
  measurableMetric: 'closing-line-value' | 'odds-change-pct' | 'data-quality-score' | 'edge-persistence';
  targetValue: DeterministicNumber;
  horizonMinutes: DeterministicNumber;
}

export interface ApprovalCheck {
  id: string;
  label: string;
  detail: string;
  required: boolean;
  acknowledged: boolean;
}

export interface ApprovalInfo {
  required: true;
  state: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string | null;
  requestedBy: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  note: string | null;
  checklist: ApprovalCheck[];
  blockers: string[];
}

export interface ExecutionStep {
  id: string;
  at: string;
  actionId: string;
  label: string;
  status: 'ok' | 'warning' | 'error';
  detail: string;
}

export interface ExecutionInfo {
  startedAt: string;
  completedAt: string | null;
  engineRef: string;
  steps: ExecutionStep[];
  observationsCount: DeterministicNumber;
  triggerFired: boolean;
  triggerFiredAt: string | null;
  failureReason: string | null;
}

export interface MeasurementInfo {
  measuredAt: string;
  verdict: 'beat-close' | 'matched-close' | 'lost-to-close' | 'unresolved';
  closingLineValuePct: DeterministicNumber;
  realizedMovementPct: DeterministicNumber;
  calibrationDeltaPct: DeterministicNumber;
  brierScore: DeterministicNumber | null;
  objectiveMet: boolean;
  notes: string[];
}

export interface LearningMetadata {
  version: number;
  tags: string[];
  /** Feeds a future Core Engine learning loop. */
  lessons: string[];
  modelVersionAtCreation: string;
  dataQualityGradeAtCreation: 'A' | 'B' | 'C' | 'D';
  confidenceAtCreation: DeterministicNumber;
  outcomeFeedback: 'pending' | 'confirmed' | 'contradicted' | 'inconclusive';
  replayableInputsDigest: string;
}

export interface MissionTransition {
  from: MissionStatus | null;
  to: MissionStatus;
  at: string;
  actor: string;
  reason: string;
}

export interface Mission {
  id: string;
  type: MissionType;
  createdAt: string;
  updatedAt: string;
  sourceAnalysisId: string;
  /** Immutable Decision Center/Core Engine evidence carried through the mission lifecycle. */
  decisionPacket?: DecisionPacket;
  target: MissionTarget;
  objective: string;
  rationale: string[];
  actions: MissionAction[];
  risk: MissionRisk;
  expectedOutcome: MissionExpectedOutcome;
  status: MissionStatus;
  approval: ApprovalInfo;
  execution: ExecutionInfo | null;
  measurement: MeasurementInfo | null;
  learning: LearningMetadata;
  history: MissionTransition[];
}

export const MISSION_TYPE_LABELS: Record<MissionType, string> = {
  MONITOR_MARKET: 'Monitor market',
  REASSESS_ON_MOVEMENT: 'Reassess on movement',
  DATA_QUALITY_WATCH: 'Data quality watch',
  VALUE_CONFIRMATION: 'Value confirmation',
  CORRELATION_GUARD: 'Correlation guard',
};

export const MISSION_STATUS_ORDER: MissionStatus[] = [
  'DRAFT',
  'AWAITING_APPROVAL',
  'APPROVED',
  'EXECUTING',
  'MEASURING',
  'COMPLETED',
];
