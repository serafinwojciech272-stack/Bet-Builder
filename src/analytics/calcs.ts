import type { RiskLevel, Selection } from '../domain/types';

export function impliedProbability(odds: number): number {
  if (!Number.isFinite(odds) || odds <= 1) return 1;
  return 1 / odds;
}

export function modelEv(probability: number, odds: number): number {
  return probability * odds - 1;
}

export function valueOver(probability: number, odds: number): number {
  return probability - impliedProbability(odds);
}

export function combinedOdds(oddsList: number[]): number {
  return oddsList.reduce((acc, o) => acc * o, 1);
}

export function potentialReturn(stake: number, multiOdds: number): number {
  return stake * multiOdds;
}

export function potentialProfit(stake: number, multiOdds: number): number {
  return stake * multiOdds - stake;
}

export function estimatedProbability(oddsList: number[]): number {
  if (oddsList.length === 0) return 0;
  const p = oddsList.reduce((acc, o) => acc * impliedProbability(o), 1);
  return Math.min(1, p);
}

export function jointModelProbability(probabilities: number[]): number {
  if (probabilities.length === 0) return 0;
  const p = probabilities.reduce((acc, probability) => acc * probability, 1);
  return Math.min(1, Math.max(0, p));
}

/** Remove the bookmaker margin using proportional normalization. */
export function devigProbabilities(odds: number[]): number[] {
  const raw = odds.map(impliedProbability);
  const total = raw.reduce((sum, probability) => sum + probability, 0);
  if (!total) return raw.map(() => 0);
  return raw.map((probability) => probability / total);
}

export function overround(odds: number[]): number {
  if (!odds.length) return 0;
  return odds.reduce((sum, odd) => sum + impliedProbability(odd), 0) - 1;
}

/** Full Kelly fraction for a single binary wager. Clamp at zero for negative edge. */
export function kellyFraction(probability: number, odds: number): number {
  if (!Number.isFinite(probability) || !Number.isFinite(odds) || odds <= 1) return 0;
  const p = Math.min(1, Math.max(0, probability));
  const b = odds - 1;
  const q = 1 - p;
  return Math.max(0, (b * p - q) / b);
}

export function fractionalKellyStake(bankroll: number, probability: number, odds: number, fraction = 0.25): number {
  if (!Number.isFinite(bankroll) || bankroll <= 0) return 0;
  const safeFraction = Math.min(1, Math.max(0, fraction));
  return bankroll * kellyFraction(probability, odds) * safeFraction;
}

export function estimatedEv(selections: Selection[]): number {
  if (selections.length === 0) return 0;
  const multi = combinedOdds(selections.map((s) => s.odds));
  return jointModelProbability(selections.map((s) => s.probability)) * multi - 1;
}

export function riskForOdds(odds: number): RiskLevel {
  if (odds >= 4) return 'CRITICAL';
  if (odds >= 2.6) return 'HIGH';
  if (odds >= 1.7) return 'MEDIUM';
  return 'LOW';
}

export type OddsMovement = 'UP' | 'DOWN' | 'STABLE';

export function oddsMovement(open: number, current: number, tolerancePct = 0.5): OddsMovement {
  const diffPct = ((current - open) / open) * 100;
  if (diffPct > tolerancePct) return 'UP';
  if (diffPct < -tolerancePct) return 'DOWN';
  return 'STABLE';
}

export function movementPercent(open: number, current: number): number {
  if (open <= 0) return 0;
  return ((current - open) / open) * 100;
}
