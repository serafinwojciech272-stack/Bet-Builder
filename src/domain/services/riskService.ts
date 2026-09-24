import { det } from '../numbers';
import type { DeterministicNumber, SportEvent } from '../types';
import type { MarketMovement } from './movementService';
import type { DataQualityReport } from './dataQualityService';
import type { ValueAnalysis } from './valueService';

const RISK_SERVICE_ID = 'risk-service' as const;
const CORRELATION_SERVICE_ID = 'correlation-service' as const;

export type RiskLevel = 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH';

export interface RiskFactorCalc {
  id: string;
  label: string;
  weight: DeterministicNumber;
  score: DeterministicNumber;
  note: string;
}

export interface RiskAssessmentCalc {
  eventId: string;
  level: RiskLevel;
  score: DeterministicNumber;
  factors: RiskFactorCalc[];
  exposureCeilingPct: DeterministicNumber;
  timeToStartMinutes: DeterministicNumber;
  computedAt: string;
}

/** Stage 5c: deterministic risk scoring (0 = calm, 1 = hostile). */
export function computeRisk(
  event: SportEvent,
  movement: MarketMovement | null,
  quality: DataQualityReport,
  value: ValueAnalysis,
  now: Date = new Date(),
): RiskAssessmentCalc {
  const timeToStart = (new Date(event.startTime).getTime() - now.getTime()) / 60_000;
  const volatility = movement
    ? movement.selections.reduce((m, s) => Math.max(m, s.volatility.value), 0)
    : 0;
  const volatilityScore = Math.min(1, volatility / 4);
  const qualityRisk = 1 - quality.score.value;
  const liquidityRisk = 1 - event.liquidity;
  const timingRisk = timeToStart < 0 ? 0.9 : Math.max(0, Math.min(1, 1 - timeToStart / 720));
  const edgeFragility = Math.min(
    1,
    Math.abs(value.bestEdgePct.value) < 1.5 ? 0.7 : 0.25 + (movement?.steamDetected ? 0.35 : 0),
  );
  const availabilityRisk = Math.min(
    1,
    (event.homeTeam.injuriesOut + event.awayTeam.injuriesOut) / 8,
  );

  const factors: Array<Omit<RiskFactorCalc, 'weight' | 'score'> & { weight: number; score: number }> = [
    {
      id: 'volatility',
      label: 'Price volatility',
      weight: 0.26,
      score: volatilityScore,
      note: movement
        ? `Peak per-step volatility ${volatility.toFixed(2)}% across ${movement.snapshotCount.value} snapshots`
        : 'No movement history available',
    },
    {
      id: 'data-quality',
      label: 'Input data quality',
      weight: 0.24,
      score: qualityRisk,
      note: `Quality grade ${quality.grade} (${(quality.score.value * 100).toFixed(0)}/100)`,
    },
    {
      id: 'liquidity',
      label: 'Market liquidity',
      weight: 0.18,
      score: liquidityRisk,
      note: `Modelled liquidity index ${(event.liquidity * 100).toFixed(0)}%`,
    },
    {
      id: 'timing',
      label: 'Time-to-start pressure',
      weight: 0.14,
      score: timingRisk,
      note:
        timeToStart < 0
          ? 'Event already in play — in-play pricing regime'
          : `${Math.round(timeToStart)} minutes until start`,
    },
    {
      id: 'edge-fragility',
      label: 'Edge fragility',
      weight: 0.1,
      score: edgeFragility,
      note: `Best observed edge ${value.bestEdgePct.formatted}`,
    },
    {
      id: 'availability',
      label: 'Squad availability noise',
      weight: 0.08,
      score: availabilityRisk,
      note: `${event.homeTeam.injuriesOut + event.awayTeam.injuriesOut} players listed out`,
    },
  ];

  const score = factors.reduce((sum, f) => sum + f.weight * f.score, 0);
  const level: RiskLevel = score >= 0.68 ? 'HIGH' : score >= 0.5 ? 'ELEVATED' : score >= 0.32 ? 'MODERATE' : 'LOW';
  const exposureCeiling = Math.max(0.5, (1 - score) * 4);

  return {
    eventId: event.id,
    level,
    score: det(score, 'ratio', RISK_SERVICE_ID),
    factors: factors.map((f) => ({
      id: f.id,
      label: f.label,
      weight: det(f.weight, 'ratio', RISK_SERVICE_ID),
      score: det(f.score, 'ratio', RISK_SERVICE_ID),
      note: f.note,
    })),
    exposureCeilingPct: det(exposureCeiling, 'ratio', RISK_SERVICE_ID),
    timeToStartMinutes: det(timeToStart, 'minutes', RISK_SERVICE_ID),
    computedAt: now.toISOString(),
  };
}

/**
 * The historical `undefined.weight` failure mode came from sorting/aggregating
 * risk factors whose optional `weight`/`score` fields were absent. These
 * accessors make a missing factor a defined, non-crashing value while keeping a
 * valid factor exact.
 */
export function factorWeight(factor: { weight?: DeterministicNumber } | null | undefined): number {
  const value = factor?.weight?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function factorScore(factor: { score?: DeterministicNumber } | null | undefined): number {
  const value = factor?.score?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Weighted impact of a factor, safe against missing weight/score objects. */
export function factorImpact(factor: { weight?: DeterministicNumber; score?: DeterministicNumber } | null | undefined): number {
  return factorWeight(factor) * factorScore(factor);
}

export type CorrelationLevel = 'ISOLATED' | 'LOW' | 'MODERATE' | 'HIGH';
export interface CorrelationCluster {
  id: string;
  label: string;
  reason: 'shared-league' | 'shared-team' | 'shared-kickoff-window' | 'shared-market-type';
  strength: DeterministicNumber;
  relatedEventIds: string[];
}

export interface CorrelationAssessmentCalc {
  eventId: string;
  level: CorrelationLevel;
  score: DeterministicNumber;
  clusters: CorrelationCluster[];
  independentExposureCount: DeterministicNumber;
  computedAt: string;
}

export interface CorrelationContextEntry {
  eventId: string;
  label: string;
  leagueId: string;
  teamIds: string[];
  startTime: string;
  market: string;
}

/** Stage 5d: deterministic correlation / clustering across active exposure. */
export function computeCorrelation(
  event: SportEvent,
  market: string,
  context: readonly CorrelationContextEntry[],
  now: Date = new Date(),
): CorrelationAssessmentCalc {
  const clusters: CorrelationCluster[] = [];
  const others = context.filter((c) => c.eventId !== event.id);
  const eventTeams = new Set([event.homeTeam.id, event.awayTeam.id]);
  const start = new Date(event.startTime).getTime();

  const sharedTeam = others.filter((o) => o.teamIds.some((t) => eventTeams.has(t)));
  if (sharedTeam.length) {
    clusters.push({
      id: 'shared-team',
      label: `${sharedTeam.length} active exposure(s) share a competitor`,
      reason: 'shared-team',
      strength: det(Math.min(1, 0.55 + sharedTeam.length * 0.15), 'ratio', CORRELATION_SERVICE_ID),
      relatedEventIds: sharedTeam.map((o) => o.eventId),
    });
  }

  const sharedLeague = others.filter((o) => o.leagueId === event.league.id);
  if (sharedLeague.length) {
    clusters.push({
      id: 'shared-league',
      label: `${sharedLeague.length} exposure(s) in ${event.league.name}`,
      reason: 'shared-league',
      strength: det(Math.min(0.8, 0.28 + sharedLeague.length * 0.12), 'ratio', CORRELATION_SERVICE_ID),
      relatedEventIds: sharedLeague.map((o) => o.eventId),
    });
  }

  const sameWindow = others.filter(
    (o) => Math.abs(new Date(o.startTime).getTime() - start) < 3 * 60 * 60 * 1000,
  );
  if (sameWindow.length) {
    clusters.push({
      id: 'shared-kickoff-window',
      label: `${sameWindow.length} exposure(s) start within ±3 hours`,
      reason: 'shared-kickoff-window',
      strength: det(Math.min(0.6, 0.18 + sameWindow.length * 0.09), 'ratio', CORRELATION_SERVICE_ID),
      relatedEventIds: sameWindow.map((o) => o.eventId),
    });
  }

  const sameMarket = others.filter((o) => o.market === market);
  if (sameMarket.length) {
    clusters.push({
      id: 'shared-market-type',
      label: `${sameMarket.length} exposure(s) on the same market type`,
      reason: 'shared-market-type',
      strength: det(Math.min(0.5, 0.12 + sameMarket.length * 0.07), 'ratio', CORRELATION_SERVICE_ID),
      relatedEventIds: sameMarket.map((o) => o.eventId),
    });
  }

  const score = clusters.length
    ? Math.min(1, clusters.reduce((m, c) => Math.max(m, c.strength.value), 0) * 0.7 + clusters.length * 0.06)
    : 0;
  const level: CorrelationLevel =
    score >= 0.66 ? 'HIGH' : score >= 0.42 ? 'MODERATE' : score > 0 ? 'LOW' : 'ISOLATED';

  const related = new Set(clusters.flatMap((c) => c.relatedEventIds));

  return {
    eventId: event.id,
    level,
    score: det(score, 'ratio', CORRELATION_SERVICE_ID),
    clusters,
    independentExposureCount: det(
      Math.max(0, others.length - related.size),
      'count',
      CORRELATION_SERVICE_ID,
    ),
    computedAt: now.toISOString(),
  };
}
