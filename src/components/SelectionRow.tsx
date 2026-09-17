import { useMemo } from 'react';
import { analyzeSelectionDeterministic } from '../services/services';
import { DemoBadge, RiskBadge } from './ui';
import type { Selection } from '../domain/types';

export function SelectionRow({ selection, added, onAdd, onRemove }: { selection: Selection; added: boolean; onAdd: () => void; onRemove: () => void }) {
  const analysis = useMemo(() => analyzeSelectionDeterministic(selection), [selection]);
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const evPct = `${analysis.ev >= 0 ? '+' : ''}${(analysis.ev * 100).toFixed(1)}%`;
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">
            {selection.shortName}
            {selection.line !== undefined ? ` · Ln ${selection.line}` : ''}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <span className="rounded bg-violet-500/15 border border-violet-500/30 px-1.5 py-0.5 text-sm font-bold text-violet-200">
              {selection.odds.toFixed(2)}
            </span>
            <RiskBadge risk={selection.risk} />
            <span className="text-xs text-slate-400">Conf {pct(selection.confidence)}</span>
          </div>
        </div>
        <button type="button" onClick={added ? onRemove : onAdd} aria-pressed={added} className={`shrink-0 rounded-md px-3 py-2 text-sm font-semibold transition ${added ? 'border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20' : 'border border-violet-500/40 bg-violet-500/15 text-violet-200 hover:bg-violet-500/25'}`}>
          {added ? 'Remove' : 'Add'}
        </button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] sm:grid-cols-5">
        <div><div className="text-slate-500">Prob</div><div className="font-semibold text-white">{pct(analysis.probability)}</div></div>
        <div><div className="text-slate-500">Implied</div><div className="font-semibold text-white">{pct(analysis.impliedProbability)}</div></div>
        <div><div className="text-slate-500">Value</div><div className={`font-semibold ${analysis.value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{analysis.value >= 0 ? '+' : ''}{pct(analysis.value)}</div></div>
        <div><div className="text-slate-500">EV</div><div className={`font-semibold ${analysis.ev >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{evPct}</div></div>
        <div className="col-span-3 sm:col-span-1"><div className="text-slate-500">Quality</div><div className="font-semibold text-white">{analysis.dataQuality}</div></div>
      </div>
      <div className="mt-2"><DemoBadge label="MOCK ANALYSIS" /></div>
    </div>
  );
}
