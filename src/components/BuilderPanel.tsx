import { useBuilderStats } from '../hooks/useBuilderStats';
import { RiskBadge } from './ui';
import type { Selection } from '../domain/types';

interface Props {
  selections: Selection[];
  stake: number;
  onUpdateStake: (v: number) => void;
  onClear: () => void;
  onRemove: (id: string) => void;
  onAnalyze: () => void;
  onOptimize: () => void;
}

export function BuilderPanel({ selections, stake, onUpdateStake, onClear, onRemove, onAnalyze, onOptimize }: Props) {
  const stats = useBuilderStats(selections, stake);
  const empty = selections.length === 0;
  return (
    <aside className="flex h-full flex-col rounded-lg border border-white/10 bg-[#0e1118]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><h2 className="text-sm font-bold tracking-widest text-white uppercase">Bet Builder</h2><span className="rounded-full bg-violet-500/20 border border-violet-500/30 px-2 py-0.5 text-xs font-bold text-violet-200">{selections.length}</span></div>
      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"><div className="text-slate-400 text-sm">No selections yet. Open an event and add a selection to begin.</div><span className="rounded-full border border-emerald-400/20 bg-emerald-400/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">Live provider</span></div>
      ) : (
        <>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">{selections.map((s) => <div key={s.id} className="flex items-start justify-between gap-2 rounded-md border border-white/10 bg-white/[0.03] p-2.5"><div className="min-w-0"><div className="truncate text-sm font-semibold text-white">{s.shortName}</div><div className="text-xs text-slate-400">@ {s.odds.toFixed(2)}</div></div><button type="button" aria-label={`Remove ${s.shortName}`} onClick={() => onRemove(s.id)} className="shrink-0 rounded border border-white/15 px-2 py-1 text-xs text-slate-300 hover:border-red-500/50 hover:text-red-300">✕</button></div>)}</div>
          <div className="space-y-3 border-t border-white/10 p-3">
            {stats.warnings.length > 0 ? <div role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] leading-snug text-amber-300"><div className="font-bold uppercase tracking-wider mb-1">Correlation warning</div>{stats.warnings[0]}</div> : null}
            <label className="block text-[11px] uppercase tracking-wider text-slate-400">Stake<input type="number" min={0} value={stake} onChange={(e) => onUpdateStake(Number(e.target.value))} className="mt-1 w-full rounded-md border border-white/15 bg-[#12151c] px-3 py-2 text-sm text-white" /></label>
            <dl className="space-y-1 text-sm"><div className="flex justify-between"><dt className="text-slate-400">Combined odds</dt><dd className="font-semibold text-white">{stats.multi.toFixed(2)}</dd></div><div className="flex justify-between"><dt className="text-slate-400">Potential return</dt><dd className="font-semibold text-emerald-400">{stats.ret.toFixed(2)}</dd></div><div className="flex justify-between"><dt className="text-slate-400">Est. probability</dt><dd className="font-semibold text-white">{Math.round(stats.estProb * 100)}%</dd></div><div className="flex justify-between"><dt className="text-slate-400">Est. EV</dt><dd className={`font-semibold ${stats.ev >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{stats.ev >= 0 ? '+' : ''}{(stats.ev * 100).toFixed(1)}%</dd></div><div className="flex justify-between items-center"><dt className="text-slate-400">Risk</dt><dd><RiskBadge risk={stats.risk as never} /></dd></div></dl>
            <div className="grid grid-cols-2 gap-2"><button type="button" onClick={onAnalyze} className="rounded-md border border-violet-500/40 bg-violet-500/15 px-3 py-2 text-sm font-semibold text-violet-200 hover:bg-violet-500/25">Analyze</button><button type="button" onClick={onOptimize} className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10">Optimize</button></div>
            <button type="button" onClick={onClear} className="w-full rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-300 hover:bg-red-500/15">Clear Builder</button>
            <div className="text-center"><span className="rounded-full border border-emerald-400/20 bg-emerald-400/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">LIVE ODDS · CORE ENGINE</span></div>
          </div>
        </>
      )}
    </aside>
  );
}
