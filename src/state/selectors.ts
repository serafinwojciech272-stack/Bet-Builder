import type { CanonicalDataset } from '../domain/repositories';
import type { MarketKey, SportEvent } from '../domain/types';
import { MARKET_LABELS } from '../domain/feed/normalization';
import { computeMarketMovement, primaryMarketFor, type MarketMovement } from '../domain/services/movementService';
import { assessDataQuality, type DataQualityReport } from '../domain/services/dataQualityService';
import { computeModelProbabilities, type ModelProbabilitySet } from '../domain/services/probabilityService';
import { computeValue, type ValueAnalysis } from '../domain/services/valueService';
import { computeRisk, type RiskAssessmentCalc } from '../domain/services/riskService';

/** Label shown for a real event that the provider serves without bookmaker odds. */
export const NO_ODDS_MARKET_LABEL = 'No bookmaker market';

export interface EventIntel {
  event: SportEvent;
  /** Primary bookmaker market, or null when the provider publishes no odds. */
  market: MarketKey | null;
  /** Always-safe display label for `market` (never empty). */
  marketLabel: string;
  movement: MarketMovement | null;
  quality: DataQualityReport;
  model: ModelProbabilitySet;
  value: ValueAnalysis;
  risk: RiskAssessmentCalc;
}

/**
 * Deterministic pre-compute used by the dashboard/explorer.
 * Identical services as the intelligence layer — one source of numbers.
 *
 * Every normalized event is retained, including real events the provider serves
 * without bookmaker odds (`LIVE_DATA_NO_ODDS`). Those carry `market: null`, no
 * movement and no value signals, so callers must tolerate the absence rather than
 * filter the event out of existence.
 */
export function buildEventIntel(dataset: CanonicalDataset, now: Date = new Date()): EventIntel[] {
  const out: EventIntel[] = [];
  for (const event of dataset.events) {
    const market = primaryMarketFor(event.id, dataset.snapshots);
    const scoped: MarketKey = market ?? 'match-winner';
    const movement = computeMarketMovement(event.id, scoped, dataset.snapshots);
    const quality = assessDataQuality(event.id, scoped, dataset.snapshots, dataset.issues, now);
    const selectionIds = movement ? movement.selections.map((s) => s.selectionId) : [];
    const model = computeModelProbabilities(event, scoped, selectionIds, now);
    const value = computeValue(event.id, scoped, dataset.snapshots, model, quality, now);
    const risk = computeRisk(event, movement, quality, value, now);
    out.push({
      event,
      market,
      marketLabel: market ? MARKET_LABELS[market] : NO_ODDS_MARKET_LABEL,
      movement,
      quality,
      model,
      value,
      risk,
    });
  }
  return out;
}

export interface NotableMovement {
  eventId: string;
  eventLabel: string;
  leagueName: string;
  selectionId: string;
  label: string;
  openingPrice: string;
  currentPrice: string;
  changePct: number;
  changeLabel: string;
  direction: 'shortening' | 'drifting' | 'stable';
  steam: boolean;
  books: number;
}

export function notableMovements(intel: EventIntel[], limit = 6): NotableMovement[] {
  const rows: NotableMovement[] = [];
  for (const i of intel) {
    if (!i.movement) continue;
    for (const s of i.movement.selections) {
      rows.push({
        eventId: i.event.id,
        eventLabel: `${i.event.homeTeam.shortName} v ${i.event.awayTeam.shortName}`,
        leagueName: i.event.league.name,
        selectionId: s.selectionId,
        label: s.label,
        openingPrice: s.openingPrice.formatted,
        currentPrice: s.currentPrice.formatted,
        changePct: s.changePct.value,
        changeLabel: s.changePct.formatted,
        direction: s.direction,
        steam: s.steam,
        books: i.movement.bookmakersTracked.length,
      });
    }
  }
  return rows
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, limit);
}

export interface ValueRow {
  eventId: string;
  eventLabel: string;
  label: string;
  tier: string;
  edgePct: number;
  edgeLabel: string;
  qualityAdjusted: string;
  bestPrice: string;
  modelProbability: string;
  impliedProbability: string;
  grade: string;
}

export function topValueSignals(intel: EventIntel[], limit = 6): ValueRow[] {
  const rows: ValueRow[] = [];
  for (const i of intel) {
    for (const s of i.value.signals) {
      if (s.tier === 'none' || s.tier === 'negative') continue;
      rows.push({
        eventId: i.event.id,
        eventLabel: `${i.event.homeTeam.shortName} v ${i.event.awayTeam.shortName}`,
        label: s.label,
        tier: s.tier,
        edgePct: s.edgePct.value,
        edgeLabel: s.edgePct.formatted,
        qualityAdjusted: s.qualityAdjustedEdgePct.formatted,
        bestPrice: s.bestPrice.formatted,
        modelProbability: s.modelProbability.formatted,
        impliedProbability: s.impliedProbability.formatted,
        grade: i.quality.grade,
      });
    }
  }
  return rows.sort((a, b) => b.edgePct - a.edgePct).slice(0, limit);
}

export interface AlertRow {
  id: string;
  eventId: string;
  eventLabel: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  kind: string;
}

export function dataQualityAlerts(intel: EventIntel[], limit = 6): AlertRow[] {
  const rows: AlertRow[] = [];
  for (const i of intel) {
    for (const issue of i.quality.issues) {
      if (issue.severity === 'info') continue;
      rows.push({
        id: `${i.event.id}-${issue.code}-${rows.length}`,
        eventId: i.event.id,
        eventLabel: `${i.event.homeTeam.shortName} v ${i.event.awayTeam.shortName}`,
        severity: issue.severity,
        message: issue.message,
        kind: issue.code,
      });
    }
  }
  const order = { error: 0, warning: 1, info: 2 } as const;
  return rows.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, limit);
}

export function riskAlerts(intel: EventIntel[], limit = 5): AlertRow[] {
  return intel
    .filter((i) => i.risk.level === 'ELEVATED' || i.risk.level === 'HIGH')
    .sort((a, b) => b.risk.score.value - a.risk.score.value)
    .slice(0, limit)
    .map((i) => {
      const worst = [...i.risk.factors].sort(
        (a, b) => (b?.score?.value ?? 0) * (b?.weight?.value ?? 0) - (a?.score?.value ?? 0) * (a?.weight?.value ?? 0),
      )[0];
      return {
        id: `${i.event.id}-risk`,
        eventId: i.event.id,
        eventLabel: `${i.event.homeTeam.shortName} v ${i.event.awayTeam.shortName}`,
        severity: i.risk.level === 'HIGH' ? ('error' as const) : ('warning' as const),
        message: `${i.risk.level} risk (${(i.risk.score.value * 100).toFixed(0)}/100) — ${worst?.note ?? 'Risk factors unavailable in this snapshot.'}`,
        kind: i.risk.level,
      };
    });
}
