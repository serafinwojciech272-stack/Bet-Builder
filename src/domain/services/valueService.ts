import { det } from '../numbers';
import type { BookmakerId, DeterministicNumber, MarketKey, OddsSnapshot } from '../types';
import {
  bestPrice,
  consensusPrice,
  devig,
  expectedValue,
  impliedProbability,
  kellyFraction,
  latestQuotesBySelection,
} from './oddsMath';
import type { ModelProbabilitySet } from './probabilityService';
import type { DataQualityReport } from './dataQualityService';

const SERVICE_ID = 'value-service' as const;

export type ValueTier = 'strong' | 'moderate' | 'marginal' | 'none' | 'negative';

export interface ValueSignalCalc {
  selectionId: string;
  label: string;
  bestBookmaker: BookmakerId | null;
  bestPrice: DeterministicNumber;
  consensusPrice: DeterministicNumber;
  impliedProbability: DeterministicNumber;
  fairProbability: DeterministicNumber;
  modelProbability: DeterministicNumber;
  edgePct: DeterministicNumber;
  evPerUnit: DeterministicNumber;
  kellyFraction: DeterministicNumber;
  tier: ValueTier;
  qualityAdjustedEdgePct: DeterministicNumber;
}

export interface ValueAnalysis {
  eventId: string;
  market: MarketKey;
  signals: ValueSignalCalc[];
  overround: DeterministicNumber;
  bestEdgePct: DeterministicNumber;
  computedAt: string;
}

/** Stage 5b: deterministic value / edge computation. */
export function computeValue(
  eventId: string,
  market: MarketKey,
  snapshots: readonly OddsSnapshot[],
  model: ModelProbabilitySet,
  quality: DataQualityReport,
  now: Date = new Date(),
): ValueAnalysis {
  const scoped = snapshots.filter((s) => s.eventId === eventId && s.market === market);
  const consensusQuotes = model.probabilities.map((p) => {
    const latest = latestQuotesBySelection(scoped, p.selectionId);
    return {
      selectionId: p.selectionId,
      label: p.label,
      decimalOdds: consensusPrice(latest) || 0,
    };
  });
  const fair = devig(consensusQuotes.filter((q) => q.decimalOdds > 1));
  const book = consensusQuotes.reduce(
    (sum, q) => sum + (q.decimalOdds > 1 ? impliedProbability(q.decimalOdds) : 0),
    0,
  );

  const signals: ValueSignalCalc[] = model.probabilities.map((p) => {
    const latest = latestQuotesBySelection(scoped, p.selectionId);
    const best = bestPrice(latest);
    const bestOdds = best?.quote.decimalOdds ?? 0;
    const consensus = consensusPrice(latest);
    const modelP = p.probability.value;
    const edgePct = bestOdds > 1 ? (modelP - impliedProbability(bestOdds)) * 100 : 0;
    const ev = bestOdds > 1 ? expectedValue(modelP, bestOdds) : 0;
    const kelly = bestOdds > 1 ? kellyFraction(modelP, bestOdds) : 0;
    const qualityAdjusted = edgePct * quality.score.value;

    const tier: ValueTier =
      edgePct <= -2
        ? 'negative'
        : qualityAdjusted >= 4
          ? 'strong'
          : qualityAdjusted >= 2
            ? 'moderate'
            : qualityAdjusted >= 0.75
              ? 'marginal'
              : 'none';

    return {
      selectionId: p.selectionId,
      label: p.label,
      bestBookmaker: best?.bookmaker ?? null,
      bestPrice: det(bestOdds, 'decimal-odds', SERVICE_ID),
      consensusPrice: det(consensus, 'decimal-odds', SERVICE_ID),
      impliedProbability: det(bestOdds > 1 ? impliedProbability(bestOdds) : 0, 'probability', SERVICE_ID),
      fairProbability: det(fair[p.selectionId] ?? 0, 'probability', SERVICE_ID),
      modelProbability: det(modelP, 'probability', SERVICE_ID),
      edgePct: det(edgePct, 'percent', SERVICE_ID),
      evPerUnit: det(ev, 'ratio', SERVICE_ID),
      kellyFraction: det(kelly, 'ratio', SERVICE_ID),
      tier,
      qualityAdjustedEdgePct: det(qualityAdjusted, 'percent', SERVICE_ID),
    };
  });

  const bestEdge = signals.reduce((max, s) => Math.max(max, s.edgePct.value), -Infinity);

  return {
    eventId,
    market,
    signals,
    overround: det(book, 'ratio', SERVICE_ID),
    bestEdgePct: det(Number.isFinite(bestEdge) ? bestEdge : 0, 'percent', SERVICE_ID),
    computedAt: now.toISOString(),
  };
}
