/**
 * AI Analysis Contract (Phase 3).
 *
 * Hard rules encoded by these types:
 *  1. Every number is a `DeterministicNumber` minted by a deterministic domain
 *     service — the AI layer may never compute or invent a figure.
 *  2. Every qualitative statement is tagged with `origin: 'ai-inference'` or
 *     `origin: 'deterministic'`, so the UI can visually separate AI conclusions
 *     from raw market data.
 *  3. The contract is transport-agnostic: a real Core Engine / LLM backend can
 *     replace `MockAIAnalysisService` without touching consumers.
 */

import type { DeterministicNumber, MarketKey } from '../domain/types';
import type { QualityGrade } from '../domain/services/dataQualityService';
import type { CorrelationLevel, RiskLevel } from '../domain/services/riskService';
import type { ValueTier } from '../domain/services/valueService';
import type { MovementDirection, MovementPoint } from '../domain/services/movementService';

export type StatementOrigin = 'ai-inference' | 'deterministic';

export type AnalysisStance = 'constructive' | 'neutral' | 'cautious' | 'avoid';

export type ConfidenceBand = 'very-low' | 'low' | 'medium' | 'high' | 'very-high';

export interface AnalysisRequest {
  eventId: string;
  market?: MarketKey;
  /** Optional focus selection for the narrative. */
  selectionId?: string;
  requestedBy: string;
  /** Simulated engine profile; a real engine would map this to a model. */
  depth?: 'standard' | 'deep';
}

export interface AnalysisSummary {
  headline: string;
  narrative: string[];
  stance: AnalysisStance;
  origin: 'ai-inference';
  /** Ids of deterministic services the narrative was grounded in. */
  groundedIn: string[];
}

export interface ConfidenceAssessment {
  score: DeterministicNumber;
  band: ConfidenceBand;
  rationale: string;
  origin: 'ai-inference';
  drivers: Array<{
    label: string;
    impact: 'increases' | 'decreases';
    magnitude: DeterministicNumber;
  }>;
}

export interface DataQualityAssessment {
  grade: QualityGrade;
  score: DeterministicNumber;
  freshnessMinutes: DeterministicNumber;
  bookmakerCoverage: DeterministicNumber;
  completeness: DeterministicNumber;
  dispersion: DeterministicNumber;
  stale: boolean;
  partial: boolean;
  issues: Array<{ severity: 'info' | 'warning' | 'error'; message: string }>;
  interpretation: string;
  origin: 'ai-inference';
}

export interface KeyFactor {
  id: string;
  label: string;
  detail: string;
  weight: DeterministicNumber;
  polarity: 'supportive' | 'adverse' | 'neutral';
  origin: StatementOrigin;
}

export interface Signal {
  id: string;
  label: string;
  detail: string;
  strength: DeterministicNumber;
  origin: StatementOrigin;
}

export interface MarketObservation {
  id: string;
  selectionId: string;
  label: string;
  openingPrice: DeterministicNumber;
  currentPrice: DeterministicNumber;
  changePct: DeterministicNumber;
  volatility: DeterministicNumber;
  direction: MovementDirection;
  steam: boolean;
  lastMoveAt: string;
  bookCount: DeterministicNumber;
  series: MovementPoint[];
  note: string;
  origin: 'deterministic';
}

export interface ProbabilityEstimate {
  selectionId: string;
  label: string;
  modelProbability: DeterministicNumber;
  impliedProbability: DeterministicNumber;
  fairProbability: DeterministicNumber;
  modelFairOdds: DeterministicNumber;
  divergencePct: DeterministicNumber;
  modelVersion: string;
  drivers: Array<{ label: string; contribution: DeterministicNumber }>;
  origin: 'deterministic';
}

export interface ValueSignal {
  selectionId: string;
  label: string;
  bestBookmaker: string | null;
  bestPrice: DeterministicNumber;
  consensusPrice: DeterministicNumber;
  edgePct: DeterministicNumber;
  qualityAdjustedEdgePct: DeterministicNumber;
  evPerUnit: DeterministicNumber;
  kellyFraction: DeterministicNumber;
  tier: ValueTier;
  commentary: string;
  origin: StatementOrigin;
}

export interface RiskAssessment {
  level: RiskLevel;
  score: DeterministicNumber;
  exposureCeilingPct: DeterministicNumber;
  timeToStartMinutes: DeterministicNumber;
  factors: Array<{
    id: string;
    label: string;
    weight: DeterministicNumber;
    score: DeterministicNumber;
    note: string;
  }>;
  interpretation: string;
  origin: StatementOrigin;
}

export interface CorrelationAssessment {
  level: CorrelationLevel;
  score: DeterministicNumber;
  independentExposureCount: DeterministicNumber;
  clusters: Array<{
    id: string;
    label: string;
    reason: string;
    strength: DeterministicNumber;
    relatedEventIds: string[];
  }>;
  interpretation: string;
  origin: StatementOrigin;
}

export type RecommendedActionKind =
  | 'MONITOR_MARKET'
  | 'REASSESS_ON_MOVEMENT'
  | 'DATA_QUALITY_WATCH'
  | 'VALUE_CONFIRMATION'
  | 'CORRELATION_GUARD'
  | 'NO_ACTION';

export interface RecommendedAction {
  id: string;
  kind: RecommendedActionKind;
  title: string;
  detail: string;
  priority: 'low' | 'medium' | 'high';
  /** Mission proposal seed — never an execution instruction. */
  missionEligible: boolean;
  trigger?: {
    metric: 'odds-change-pct' | 'data-quality-score' | 'time-to-start-minutes' | 'edge-pct';
    comparator: 'gte' | 'lte';
    threshold: DeterministicNumber;
  };
  origin: 'ai-inference';
}

export interface AnalysisWarning {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  origin: StatementOrigin;
}

export interface Assumption {
  id: string;
  statement: string;
  basis: 'model' | 'market' | 'data-pipeline' | 'operational';
  confidence: DeterministicNumber;
  origin: 'ai-inference';
}

export interface SourceSnapshotRef {
  snapshotId: string;
  bookmaker: string;
  market: MarketKey;
  capturedAt: string;
  quoteCount: DeterministicNumber;
  feedLatencyMs: DeterministicNumber;
  provider: string;
}

export interface AnalysisMeta {
  engine: string;
  engineMode: 'mock' | 'core-engine';
  modelVersion: string;
  contractVersion: string;
  computeMs: DeterministicNumber;
  deterministicInputsDigest: string;
  partial: boolean;
  degradedReasons: string[];
}

export interface AnalysisResponse {
  analysisId: string;
  eventId: string;
  generatedAt: string;
  summary: AnalysisSummary;
  confidence: ConfidenceAssessment;
  dataQuality: DataQualityAssessment;
  keyFactors: KeyFactor[];
  positiveSignals: Signal[];
  negativeSignals: Signal[];
  marketObservations: MarketObservation[];
  probabilityEstimates: ProbabilityEstimate[];
  valueSignals: ValueSignal[];
  riskAssessment: RiskAssessment;
  correlationAssessment: CorrelationAssessment;
  recommendedActions: RecommendedAction[];
  warnings: AnalysisWarning[];
  assumptions: Assumption[];
  sourceSnapshots: SourceSnapshotRef[];
  /** Convenience context (denormalized labels only — no numbers). */
  context: {
    eventLabel: string;
    leagueName: string;
    sportLabel: string;
    market: MarketKey;
    marketLabel: string;
    startTime: string;
    status: string;
  };
  meta: AnalysisMeta;
}

export const ANALYSIS_CONTRACT_VERSION = '3.0.0';
