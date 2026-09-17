import { useMemo } from 'react';
import { combinedOdds, estimatedEv, estimatedProbability, potentialReturn } from '../analytics/calcs';
import { findCorrelatedGroups, correlateWarningsFor } from '../services/services';
import type { Selection } from '../domain/types';

export function useBuilderStats(selections: Selection[], stake: number) {
  return useMemo(() => {
    const oddsList = selections.map((s) => s.odds);
    const multi = combinedOdds(oddsList);
    const ret = potentialReturn(stake, multi);
    const ev = estimatedEv(selections);
    const estProb = estimatedProbability(oddsList);
    const groups = findCorrelatedGroups(selections);
    const warnings = correlateWarningsFor(selections);
    const worstRisk = selections.reduce<string>((acc, s) => {
      const order = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
      return order.indexOf(s.risk) > order.indexOf(acc) ? s.risk : acc;
    }, 'LOW');
    const risk = selections.length === 0 ? 'LOW' : worstRisk;
    return { multi, ret, profit: ret - stake, ev, estProb, groups, warnings, risk };
  }, [selections, stake]);
}
