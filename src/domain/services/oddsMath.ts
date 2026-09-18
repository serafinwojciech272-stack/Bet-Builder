import { det } from '../numbers';
import type { BookmakerId, DeterministicNumber, OddsQuote, OddsSnapshot } from '../types';
import { BOOKMAKERS } from '../feed/normalization';

export const ODDS_MATH_SERVICE_ID = 'odds-math' as const;

export function impliedProbability(decimalOdds: number): number {
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) return 0;
  return 1 / decimalOdds;
}

export function overround(quotes: readonly OddsQuote[]): number {
  return quotes.reduce((sum, q) => sum + impliedProbability(q.decimalOdds), 0);
}

/** Removes the bookmaker margin proportionally (multiplicative de-vig). */
export function devig(quotes: readonly OddsQuote[]): Record<string, number> {
  const total = overround(quotes);
  const out: Record<string, number> = {};
  for (const q of quotes) {
    out[q.selectionId] = total > 0 ? impliedProbability(q.decimalOdds) / total : 0;
  }
  return out;
}

export interface LatestBookQuote {
  bookmaker: BookmakerId;
  capturedAt: string;
  quote: OddsQuote;
}

/** Most recent quote per bookmaker for a selection. */
export function latestQuotesBySelection(
  snapshots: readonly OddsSnapshot[],
  selectionId: string,
): LatestBookQuote[] {
  const byBook = new Map<BookmakerId, LatestBookQuote>();
  for (const snap of snapshots) {
    const quote = snap.quotes.find((q) => q.selectionId === selectionId);
    if (!quote) continue;
    const current = byBook.get(snap.bookmaker);
    if (!current || current.capturedAt < snap.capturedAt) {
      byBook.set(snap.bookmaker, {
        bookmaker: snap.bookmaker,
        capturedAt: snap.capturedAt,
        quote,
      });
    }
  }
  return [...byBook.values()].sort((a, b) => b.quote.decimalOdds - a.quote.decimalOdds);
}

export function bestPrice(latest: readonly LatestBookQuote[]): LatestBookQuote | null {
  return latest.length ? latest[0] : null;
}

/** Reliability-weighted consensus price across books. */
export function consensusPrice(latest: readonly LatestBookQuote[]): number {
  if (!latest.length) return 0;
  let num = 0;
  let den = 0;
  for (const l of latest) {
    const w = BOOKMAKERS[l.bookmaker]?.weight ?? 0.5;
    num += l.quote.decimalOdds * w;
    den += w;
  }
  return den > 0 ? num / den : 0;
}

export function priceDispersion(latest: readonly LatestBookQuote[]): number {
  if (latest.length < 2) return 0;
  const prices = latest.map((l) => l.quote.decimalOdds);
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  const variance = prices.reduce((a, b) => a + (b - mean) ** 2, 0) / prices.length;
  return mean > 0 ? Math.sqrt(variance) / mean : 0;
}

/** Expected value per 1 unit staked. */
export function expectedValue(modelProbability: number, decimalOdds: number): number {
  return modelProbability * decimalOdds - 1;
}

/** Fractional Kelly stake (capped, never an instruction to bet). */
export function kellyFraction(modelProbability: number, decimalOdds: number): number {
  const b = decimalOdds - 1;
  if (b <= 0) return 0;
  const k = (modelProbability * b - (1 - modelProbability)) / b;
  return Math.max(0, Math.min(0.25, k));
}

export function combinedOdds(prices: readonly number[]): number {
  return prices.reduce((acc, p) => acc * p, 1);
}

export interface PricePoint {
  price: DeterministicNumber;
  implied: DeterministicNumber;
}

export function pricePoint(decimalOdds: number): PricePoint {
  return {
    price: det(decimalOdds, 'decimal-odds', ODDS_MATH_SERVICE_ID),
    implied: det(impliedProbability(decimalOdds), 'probability', ODDS_MATH_SERVICE_ID),
  };
}
