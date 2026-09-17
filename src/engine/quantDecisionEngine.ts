import type { OddsSnapshot, SportEvent } from '../domain/types';
import { devigProbabilities, kellyFraction, modelEv } from '../analytics/calcs';
import { eventQuantSnapshot, qualityScore, type QuantSignal } from '../analytics/quant';
import { analyzeDependencies, type DependencySelection } from '../analytics/dependency';
import { optimizePortfolio, type PortfolioCandidate, type PortfolioConstraints } from '../analytics/portfolio';
import { detectSteam, type MovementPoint } from '../analytics/movement';

export interface QuantDecisionInput { event: SportEvent; snapshots: OddsSnapshot[]; modelProbabilityBySelection?: Record<string, number>; previousMovement?: MovementPoint[]; portfolioConstraints?: PortfolioConstraints; }
export interface QuantDecision { eventId: string; generatedAt: string; marketSignals: QuantSignal[]; candidates: PortfolioCandidate[]; portfolio: ReturnType<typeof optimizePortfolio>; dependencies: ReturnType<typeof analyzeDependencies>; steam: ReturnType<typeof detectSteam>; methodology: string[]; }

function clamp(v: number): number { return Math.min(1, Math.max(0, v)); }

function consensusFairProbability(snapshots: OddsSnapshot[], selectionId: string): number | null {
  const odds = snapshots.flatMap((s) => s.quotes.filter((q) => q.selectionId === selectionId).map((q) => q.decimalOdds)).filter((o) => Number.isFinite(o) && o > 1);
  if (!odds.length) return null;
  return devigProbabilities(odds.length > 1 ? odds : [odds[0]])[0];
}

export function runQuantDecision(input: QuantDecisionInput): QuantDecision {
  const model = input.modelProbabilityBySelection ?? {};
  const snapshots = input.snapshots.filter((s) => s.eventId === input.event.id);
  const signalSnapshots = eventQuantSnapshot(input.event, snapshots, model);
  const marketSignals = signalSnapshots.flatMap((m) => m.signals.map((signal) => {
    if (model[signal.selectionId] !== undefined) return signal;
    const fair = consensusFairProbability(snapshots.filter((s) => s.market === m.marketKey), signal.selectionId) ?? signal.impliedProbability;
    const value = fair - signal.impliedProbability;
    return { ...signal, fairProbability: fair, value, ev: modelEv(fair, signal.odds), confidence: clamp(0.55 * (signal.qualityScore / 100) + 0.45 * fair) };
  }));
  const candidates: PortfolioCandidate[] = marketSignals.filter((s) => s.signal !== 'LOW_QUALITY' && s.ev > 0).map((s) => ({ id: s.selectionId, eventId: input.event.id, odds: s.odds, probability: s.fairProbability, ev: s.ev, qualityScore: s.qualityScore, correlationGroup: `${input.event.id}:${s.selectionId.split(':')[0]}`, label: s.selectionId }));
  const deps = analyzeDependencies(candidates);
  const portfolio = optimizePortfolio(candidates, input.portfolioConstraints);
  const steam = input.previousMovement?.length ? detectSteam(input.previousMovement) : [];
  return { eventId: input.event.id, generatedAt: new Date().toISOString(), marketSignals, candidates, portfolio, dependencies: deps, steam, methodology: ['Deterministic odds math.', 'Model probability takes precedence when explicitly supplied.', 'Otherwise fair probability is a market consensus estimate and is labelled as such.', 'Portfolio probability is dependency-adjusted; independence is not assumed blindly.', 'Signals are gated by data quality and positive estimated EV.', 'No execution or monetary action is performed by this engine.'] };
}

export function kellyForDecision(signal: QuantSignal, fraction = 0.25): number { return kellyFraction(signal.fairProbability, signal.odds) * clamp(fraction); }
