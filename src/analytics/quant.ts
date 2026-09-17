import type { OddsSnapshot, SportEvent } from '../domain/types';
import { impliedProbability, modelEv } from './calcs';

export interface QuoteStat { selectionId: string; bookmaker: string; odds: number; impliedProbability: number; }
export interface MarketQuoteSummary { selectionId: string; bestOdds: number; bestBookmaker: string | null; worstOdds: number; averageOdds: number; medianOdds: number; bookmakerCount: number; impliedProbabilityBest: number; impliedProbabilityMedian: number; dispersion: number; }
export interface MarketEfficiency { marketId: string; overround: number; normalizedProbabilities: Record<string, number>; selections: string[]; }
export interface QuantSignal { selectionId: string; odds: number; impliedProbability: number; fairProbability: number; value: number; ev: number; confidence: number; qualityScore: number; signal: 'STRONG_VALUE' | 'VALUE' | 'NEUTRAL' | 'NEGATIVE_VALUE' | 'LOW_QUALITY'; fairProbabilitySource?: 'MODEL' | 'DEVIG_CONSENSUS' | 'MARKET_IMPLIED'; }
export interface MovementSignal { selectionId: string; bookmaker: string; previousOdds: number; currentOdds: number; changePct: number; direction: 'UP' | 'DOWN' | 'STABLE'; }
export interface QuantSnapshot { eventId: string; marketKey: string; summaries: MarketQuoteSummary[]; efficiency: MarketEfficiency | null; signals: QuantSignal[]; }
type FlatQuote = { selectionId: string; bookmaker: string; odds: number };
function flatten(snapshots: OddsSnapshot[]): FlatQuote[] { return snapshots.flatMap((snapshot) => snapshot.quotes.map((quote) => ({ selectionId: quote.selectionId, bookmaker: snapshot.bookmaker, odds: quote.decimalOdds }))); }
function median(values: number[]): number { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
function clamp(value: number, min = 0, max = 1): number { return Math.min(max, Math.max(min, value)); }
export function summarizeQuotes(snapshots: OddsSnapshot[]): MarketQuoteSummary[] { const groups = new Map<string, FlatQuote[]>(); for (const quote of flatten(snapshots)) { if (!Number.isFinite(quote.odds) || quote.odds <= 1) continue; groups.set(quote.selectionId, [...(groups.get(quote.selectionId) ?? []), quote]); } return [...groups.entries()].map(([selectionId, quotes]) => { const odds = quotes.map((q) => q.odds); const best = Math.max(...odds); const bestQuote = quotes.find((q) => q.odds === best); const worst = Math.min(...odds); const average = odds.reduce((sum, value) => sum + value, 0) / odds.length; const med = median(odds); return { selectionId, bestOdds: best, bestBookmaker: bestQuote?.bookmaker ?? null, worstOdds: worst, averageOdds: average, medianOdds: med, bookmakerCount: new Set(quotes.map((q) => q.bookmaker)).size, impliedProbabilityBest: impliedProbability(best), impliedProbabilityMedian: impliedProbability(med), dispersion: average > 0 ? (best - worst) / average : 0 }; }); }

/**
 * Calculates market consensus correctly: first de-vig each bookmaker's complete
 * set of selections, then take the median probability for each selection.
 * We never de-vig a single selection across bookmakers, which is mathematically
 * invalid because the overround belongs to a bookmaker's complete market.
 */
export function marketEfficiency(snapshots: OddsSnapshot[]): MarketEfficiency | null {
  if (!snapshots.length) return null;
  const completeBooks: Array<Record<string, number>> = [];
  const allSelections = new Set<string>();
  for (const snapshot of snapshots) {
    const oddsBySelection: Record<string, number> = {};
    for (const quote of snapshot.quotes) {
      if (Number.isFinite(quote.decimalOdds) && quote.decimalOdds > 1) oddsBySelection[quote.selectionId] = quote.decimalOdds;
    }
    const ids = Object.keys(oddsBySelection);
    if (ids.length < 2) continue;
    const total = ids.reduce((sum, id) => sum + impliedProbability(oddsBySelection[id]), 0);
    if (!(total > 0)) continue;
    const normalized: Record<string, number> = {};
    for (const id of ids) { normalized[id] = impliedProbability(oddsBySelection[id]) / total; allSelections.add(id); }
    completeBooks.push(normalized);
  }
  if (!completeBooks.length || allSelections.size < 2) return null;
  const normalizedProbabilities: Record<string, number> = {};
  for (const id of allSelections) {
    const values = completeBooks.filter((book) => book[id] !== undefined).map((book) => book[id]);
    normalizedProbabilities[id] = median(values);
  }
  const totalConsensus = Object.values(normalizedProbabilities).reduce((sum, p) => sum + p, 0);
  if (!(totalConsensus > 0)) return null;
  for (const id of Object.keys(normalizedProbabilities)) normalizedProbabilities[id] /= totalConsensus;
  return { marketId: snapshots[0].market, overround: totalConsensus - 1, normalizedProbabilities, selections: Object.keys(normalizedProbabilities) };
}

export function qualityScore(bookmakerCount: number, dispersion: number, freshnessSeconds = 0): number { const coverage = clamp(bookmakerCount / 5); const dispersionPenalty = clamp(dispersion * 2); const freshnessPenalty = clamp(freshnessSeconds / 900); return Math.round(100 * clamp(0.55 * coverage + 0.3 * (1 - dispersionPenalty) + 0.15 * (1 - freshnessPenalty))); }
export function buildQuantSignals(summaries: MarketQuoteSummary[], fairProbabilityBySelection: Record<string, number>): QuantSignal[] { return summaries.map((summary) => { const fairProbability = clamp(fairProbabilityBySelection[summary.selectionId] ?? 0); const value = fairProbability - summary.impliedProbabilityBest; const ev = modelEv(fairProbability, summary.bestOdds); const quality = qualityScore(summary.bookmakerCount, summary.dispersion); const confidence = clamp(0.45 * fairProbability + 0.35 * (quality / 100) + 0.2 * clamp(summary.bookmakerCount / 5)); const signal = quality < 45 ? 'LOW_QUALITY' : ev >= 0.08 && confidence >= 0.7 ? 'STRONG_VALUE' : ev >= 0.03 ? 'VALUE' : ev <= -0.03 ? 'NEGATIVE_VALUE' : 'NEUTRAL'; return { selectionId: summary.selectionId, odds: summary.bestOdds, impliedProbability: summary.impliedProbabilityBest, fairProbability, value, ev, confidence, qualityScore: quality, signal }; }); }
export function movementSignal(previous: OddsSnapshot[], current: OddsSnapshot[]): MovementSignal[] { const previousMap = new Map(flatten(previous).map((q) => [`${q.selectionId}:${q.bookmaker}`, q])); return flatten(current).flatMap((quote) => { const prior = previousMap.get(`${quote.selectionId}:${quote.bookmaker}`); if (!prior || !Number.isFinite(prior.odds) || prior.odds <= 0) return []; const changePct = ((quote.odds - prior.odds) / prior.odds) * 100; const direction = changePct > 0.5 ? 'UP' : changePct < -0.5 ? 'DOWN' : 'STABLE'; return [{ selectionId: quote.selectionId, bookmaker: quote.bookmaker, previousOdds: prior.odds, currentOdds: quote.odds, changePct, direction }]; }); }
export function eventQuantSnapshot(event: SportEvent, snapshots: OddsSnapshot[], fairProbabilityBySelection: Record<string, number> = {}): QuantSnapshot[] { const marketKeys = [...new Set(snapshots.filter((q) => q.eventId === event.id).map((q) => q.market))]; return marketKeys.map((marketKey) => { const marketSnapshots = snapshots.filter((q) => q.eventId === event.id && q.market === marketKey); const summaries = summarizeQuotes(marketSnapshots); const efficiency = marketEfficiency(marketSnapshots); const fair = { ...efficiency?.normalizedProbabilities, ...fairProbabilityBySelection }; return { eventId: event.id, marketKey, summaries, efficiency, signals: buildQuantSignals(summaries, fair) }; }); }
