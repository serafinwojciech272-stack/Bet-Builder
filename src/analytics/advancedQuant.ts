import type { OddsSnapshot } from '../domain/types';
import { devigProbabilities, impliedProbability, kellyFraction, modelEv } from './calcs';

export interface BookmakerMarketEfficiency {
  bookmaker: string;
  overround: number;
  selectionCount: number;
}

export interface ConsensusProbability {
  selectionId: string;
  probability: number;
  bookmakerCount: number;
  medianOdds: number;
  bestOdds: number;
  dispersion: number;
}

export interface QuantQuality {
  score: number;
  coverage: number;
  freshness: number;
  agreement: number;
  completeness: number;
  reasons: string[];
}

export interface EdgeAssessment {
  selectionId: string;
  odds: number;
  marketProbability: number;
  fairProbability: number;
  edge: number;
  ev: number;
  kelly: number;
  quality: QuantQuality;
  usable: boolean;
}

export interface CLVAssessment {
  oddsAtDecision: number;
  closingOdds: number;
  oddsClv: number;
  probabilityClv: number;
  positive: boolean;
}

type FlatQuote = { selectionId: string; bookmaker: string; odds: number; capturedAt: number };

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function flatten(snapshots: OddsSnapshot[]): FlatQuote[] {
  return snapshots.flatMap((snapshot) => snapshot.quotes.flatMap((quote) => {
    const odds = quote.decimalOdds;
    const capturedAt = Date.parse(snapshot.capturedAt);
    if (!Number.isFinite(odds) || odds <= 1 || !Number.isFinite(capturedAt)) return [];
    return [{ selectionId: quote.selectionId, bookmaker: snapshot.bookmaker, odds, capturedAt }];
  }));
}

/** Per-bookmaker margin. Unlike best-price synthetic overround, all prices come from one bookmaker snapshot. */
export function bookmakerEfficiency(snapshots: OddsSnapshot[]): BookmakerMarketEfficiency[] {
  return snapshots.flatMap((snapshot) => {
    const valid = snapshot.quotes.filter((quote) => Number.isFinite(quote.decimalOdds) && quote.decimalOdds > 1);
    if (valid.length < 2) return [];
    return [{ bookmaker: snapshot.bookmaker, overround: valid.reduce((sum, quote) => sum + impliedProbability(quote.decimalOdds), 0) - 1, selectionCount: valid.length }];
  });
}

/** Median consensus is deliberately separate from the model probability: it is a market-derived baseline. */
export function consensusProbabilities(snapshots: OddsSnapshot[]): ConsensusProbability[] {
  const groups = new Map<string, FlatQuote[]>();
  for (const quote of flatten(snapshots)) groups.set(quote.selectionId, [...(groups.get(quote.selectionId) ?? []), quote]);
  return [...groups.entries()].map(([selectionId, quotes]) => {
    const odds = quotes.map((quote) => quote.odds);
    const medianOdds = median(odds);
    const raw = devigProbabilities([...groups.values()].map((group) => median(group.map((quote) => quote.odds))));
    const ids = [...groups.keys()];
    const index = ids.indexOf(selectionId);
    const probability = raw[index] ?? 0;
    const average = odds.reduce((sum, value) => sum + value, 0) / odds.length;
    const dispersion = average > 0 ? (Math.max(...odds) - Math.min(...odds)) / average : 1;
    return { selectionId, probability, bookmakerCount: new Set(quotes.map((quote) => quote.bookmaker)).size, medianOdds, bestOdds: Math.max(...odds), dispersion };
  });
}

export function quantQuality(snapshots: OddsSnapshot[], nowMs = Date.now()): QuantQuality {
  const quotes = flatten(snapshots);
  const bookmakers = new Set(quotes.map((quote) => quote.bookmaker)).size;
  const coverage = clamp(bookmakers / 5);
  const freshnessAge = quotes.length ? Math.max(0, (nowMs - Math.max(...quotes.map((quote) => quote.capturedAt))) / 1000) : 3600;
  const freshness = Math.exp(-freshnessAge / 900);
  const dispersions = consensusProbabilities(snapshots).map((item) => item.dispersion);
  const agreement = dispersions.length ? 1 - clamp((dispersions.reduce((sum, value) => sum + value, 0) / dispersions.length) * 2) : 0;
  const selectionCoverage = new Set(quotes.map((quote) => quote.selectionId)).size;
  const completeness = clamp(selectionCoverage / 2);
  const score = Math.round(100 * clamp(0.35 * coverage + 0.25 * freshness + 0.25 * agreement + 0.15 * completeness));
  const reasons: string[] = [];
  if (bookmakers < 3) reasons.push('low bookmaker coverage');
  if (freshnessAge > 300) reasons.push('stale quotes');
  if (agreement < 0.5) reasons.push('high cross-book dispersion');
  if (selectionCoverage < 2) reasons.push('incomplete market');
  return { score, coverage, freshness, agreement, completeness, reasons };
}

/** Assess an edge against an explicit fair probability. No fair probability means no edge signal. */
export function assessEdge(selectionId: string, odds: number, fairProbability: number | undefined, snapshots: OddsSnapshot[], nowMs = Date.now()): EdgeAssessment {
  const quality = quantQuality(snapshots, nowMs);
  const marketProbability = impliedProbability(odds);
  if (fairProbability === undefined || !Number.isFinite(fairProbability)) {
    return { selectionId, odds, marketProbability, fairProbability: 0, edge: 0, ev: 0, kelly: 0, quality, usable: false };
  }
  const fair = clamp(fairProbability);
  const edge = fair - marketProbability;
  return { selectionId, odds, marketProbability, fairProbability: fair, edge, ev: modelEv(fair, odds), kelly: kellyFraction(fair, odds), quality, usable: quality.score >= 50 };
}

/** Decimal-odds CLV: positive when the decision price was better than the closing price. */
export function calculateCLV(oddsAtDecision: number, closingOdds: number): CLVAssessment {
  if (!Number.isFinite(oddsAtDecision) || !Number.isFinite(closingOdds) || oddsAtDecision <= 1 || closingOdds <= 1) {
    return { oddsAtDecision, closingOdds, oddsClv: 0, probabilityClv: 0, positive: false };
  }
  const oddsClv = oddsAtDecision / closingOdds - 1;
  const probabilityClv = impliedProbability(closingOdds) - impliedProbability(oddsAtDecision);
  return { oddsAtDecision, closingOdds, oddsClv, probabilityClv, positive: oddsClv > 0 };
}

/** Deterministic exponentially weighted average for a sequence of fair-probability observations. */
export function exponentiallyWeightedAverage(values: number[], halfLife = 3): number {
  if (!values.length) return 0;
  const safeHalfLife = Math.max(0.1, halfLife);
  const decay = Math.exp(Math.log(0.5) / safeHalfLife);
  let weighted = 0;
  let totalWeight = 0;
  for (let i = 0; i < values.length; i += 1) {
    const weight = decay ** (values.length - 1 - i);
    weighted += clamp(values[i]) * weight;
    totalWeight += weight;
  }
  return totalWeight ? weighted / totalWeight : 0;
}
