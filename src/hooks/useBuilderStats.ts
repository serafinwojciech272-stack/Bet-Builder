import { useMemo } from 'react';
import { combinedOdds, estimatedEv, estimatedProbability, potentialReturn } from '../analytics/calcs';
import { findCorrelatedGroups, correlateWarningsFor } from '../services/services';
import type { Selection } from '../domain/types';

/** Builder outputs must stay finite: a non-finite price must never surface as NaN/Infinity on the slip. */
const finiteOr = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);

export interface BuilderStats {
  multi: number;
  ret: number;
  profit: number;
  ev: number;
  estProb: number;
  groups: string[][];
  warnings: string[];
  risk: string;
}

export function computeBuilderStats(selections: Selection[], stake: number): BuilderStats {
  const hasSelections = selections.length > 0;
  const oddsList = selections.map((s) => finiteOr(s.odds, 0));
  const multi = hasSelections ? finiteOr(combinedOdds(oddsList), 0) : 0;
  const ret = finiteOr(potentialReturn(stake, multi), 0);
  const ev = finiteOr(estimatedEv(selections), 0);
  const estProb = finiteOr(estimatedProbability(oddsList), 0);
  const groups = findCorrelatedGroups(selections);
  const warnings = correlateWarningsFor(selections);
  const worstRisk = selections.reduce<string>((acc, s) => {
    const order = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    return order.indexOf(s.risk) > order.indexOf(acc) ? s.risk : acc;
  }, 'LOW');
  const risk = selections.length === 0 ? 'LOW' : worstRisk;
  return { multi, ret, profit: hasSelections ? finiteOr(ret - stake, 0) : 0, ev, estProb, groups, warnings, risk };
}

export function useBuilderStats(selections: Selection[], stake: number): BuilderStats {
  return useMemo(() => computeBuilderStats(selections, stake), [selections, stake]);
}
