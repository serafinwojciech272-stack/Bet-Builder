import type { OddsSnapshot, SportEvent } from '../domain/types';
import { kellyFraction, modelEv } from '../analytics/calcs';
import { eventQuantSnapshot, type QuantSignal } from '../analytics/quant';
import { analyzeDependencies } from '../analytics/dependency';
import { optimizePortfolio, type PortfolioCandidate, type PortfolioConstraints } from '../analytics/portfolio';
import { detectSteam, type MovementPoint } from '../analytics/movement';

export interface QuantDecisionInput {
  event: SportEvent;
  snapshots: OddsSnapshot[];
  modelProbabilityBySelection?: Record<string, number>;
  previousMovement?: MovementPoint[];
  portfolioConstraints?: PortfolioConstraints;
}

export interface QuantDecision {
  eventId: string;
  generatedAt: string;
  marketSignals: QuantSignal[];
  candidates: PortfolioCandidate[];
  portfolio: ReturnType<typeof optimizePortfolio>;
  dependencies: ReturnType<typeof analyzeDependencies>;
  steam: ReturnType<typeof detectSteam>;
  methodology: string[];
}

function clamp(v: number): number { return Math.min(1, Math.max(0, v)); }

export function runQuantDecision(input: QuantDecisionInput): QuantDecision {
  const model = input.modelProbabilityBySelection ?? {};
  const snapshots = input.snapshots.filter((s) => s.eventId === input.event.id);
  const quantMarkets = eventQuantSnapshot(input.event, snapshots, model);
  const marketSignals = quantMarkets.flatMap((market) => market.signals.map((signal) => {
    if (model[signal.selectionId] !== undefined) return signal;
    const consensusFair = market.efficiency?.normalizedProbabilities[signal.selectionId];
    const fairProbability = consensusFair ?? signal.impliedProbability;
    const value = fairProbability - signal.impliedProbability;
    return {
      ...signal,
      fairProbability,
      value,
      ev: modelEv(fairProbability, signal.odds),
      confidence: clamp(0.55 * (signal.qualityScore / 100) + 0.45 * fairProbability),
    };
  }));

  const candidates: PortfolioCandidate[] = marketSignals
    .filter((s) => s.signal !== 'LOW_QUALITY' && s.ev > 0)
    .map((s) => ({
      id: s.selectionId,
      eventId: input.event.id,
      marketId: s.selectionId.split(':')[0],
      odds: s.odds,
      probability: s.fairProbability,
      ev: s.ev,
      qualityScore: s.qualityScore,
      correlationGroup: `${input.event.id}:${s.selectionId.split(':')[0]}`,
      label: s.selectionId,
    }));

  const dependencies = analyzeDependencies(candidates);
  const portfolio = optimizePortfolio(candidates, input.portfolioConstraints);
  const steam = input.previousMovement?.length ? detectSteam(input.previousMovement) : [];

  return {
    eventId: input.event.id,
    generatedAt: new Date().toISOString(),
    marketSignals,
    candidates,
    portfolio,
    dependencies,
    steam,
    methodology: [
      'Deterministic odds mathematics.',
      'Explicit model probability takes precedence over market consensus.',
      'Without a model probability, fair probability comes from market de-vig consensus.',
      'Portfolio probability is dependency-adjusted; independence is not assumed blindly.',
      'Low-quality and non-positive-EV signals are excluded from portfolio candidates.',
      'Kelly is exposed only as a sizing reference; it does not execute stakes.',
      'No execution or monetary action is performed by this engine.',
    ],
  };
}

export function kellyForDecision(signal: QuantSignal, fraction = 0.25): number {
  return kellyFraction(signal.fairProbability, signal.odds) * clamp(fraction);
}
