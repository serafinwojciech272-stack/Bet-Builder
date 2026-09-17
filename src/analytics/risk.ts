import { combinedOdds, jointModelProbability, kellyFraction } from './calcs';

export interface RiskSelection {
  id: string;
  odds: number;
  probability: number;
  correlationGroup: string;
  stakeWeight?: number;
}

export interface PortfolioRisk {
  selectionCount: number;
  correlationGroups: number;
  concentration: number;
  effectiveDiversification: number;
  jointProbability: number;
  combinedOdds: number;
  estimatedEv: number;
  maxLossFraction: number;
  kellyFraction: number;
  riskBand: 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME';
}

function clamp(value: number, min = 0, max = 1): number { return Math.min(max, Math.max(min, value)); }

export function portfolioRisk(selections: RiskSelection[]): PortfolioRisk {
  if (!selections.length) {
    return { selectionCount: 0, correlationGroups: 0, concentration: 0, effectiveDiversification: 0, jointProbability: 0, combinedOdds: 1, estimatedEv: 0, maxLossFraction: 0, kellyFraction: 0, riskBand: 'LOW' };
  }
  const groups = new Map<string, number>();
  for (const selection of selections) groups.set(selection.correlationGroup, (groups.get(selection.correlationGroup) ?? 0) + 1);
  const largestGroup = Math.max(...groups.values());
  const concentration = largestGroup / selections.length;
  const effectiveDiversification = clamp(groups.size / selections.length);
  const jointProbability = jointModelProbability(selections.map((s) => clamp(s.probability)));
  const odds = combinedOdds(selections.map((s) => s.odds));
  const estimatedEv = jointProbability * odds - 1;
  const weightedKelly = selections.reduce((sum, selection) => sum + kellyFraction(selection.probability, selection.odds), 0) / selections.length;
  const maxLossFraction = 1;
  const riskScore = 0.5 * concentration + 0.3 * (1 - effectiveDiversification) + 0.2 * clamp(odds / 20);
  const riskBand = riskScore >= 0.75 ? 'EXTREME' : riskScore >= 0.5 ? 'HIGH' : riskScore >= 0.3 ? 'MODERATE' : 'LOW';
  return { selectionCount: selections.length, correlationGroups: groups.size, concentration, effectiveDiversification, jointProbability, combinedOdds: odds, estimatedEv, maxLossFraction, kellyFraction: weightedKelly, riskBand };
}

export function stakeByRiskBudget(bankroll: number, riskBudgetFraction: number, portfolioKelly: number, maxStakeFraction = 0.02): number {
  if (!Number.isFinite(bankroll) || bankroll <= 0) return 0;
  const budget = Math.max(0, Math.min(1, riskBudgetFraction));
  const cap = Math.max(0, Math.min(1, maxStakeFraction));
  return bankroll * Math.min(cap, Math.max(0, portfolioKelly) * budget);
}
