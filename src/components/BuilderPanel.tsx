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
  feedMode?: 'LIVE' | 'DEMO' | 'UNKNOWN';
}

export function BuilderPanel({ selections, stake, onUpdateStake, onClear, onRemove, onAnalyze, onOptimize, feedMode = 'UNKNOWN' }: Props) {
  const stats = useBuilderStats(selections, stake);
  const empty = selections.length === 0;
  return (
    <aside className="glass-strong glow-ai flex h-full flex-col overflow-hidden rounded-2xl">
      <div className="relative border-b border-white/[.08] px-4 py-4">
        <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative flex items-center justify-between gap-3">
          <div><div className="text-[9px] font-black uppercase tracking-[.24em] text-violet-300">CORE ENGINE</div><h2 className="mt-1 text-lg font-black tracking-tight text-white">Bet Builder</h2></div>
          <span className="rounded-full border border-violet-400/25 bg-violet-400/10 px-2.5 py-1 text-[11px] font-black text-violet-200">{selections.length} LEGS</span>
        </div>
      </div>
      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-400/10 text-xl text-violet-200">+</div><div><div className="text-sm font-semibold text-slate-200">Your portfolio is empty</div><div className="mt-1 text-xs leading-relaxed text-slate-500">Select markets from the board to start building.</div></div><span className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.16em] ${feedMode === 'LIVE' ? 'border-emerald-400/20 bg-emerald-400/[.06] text-emerald-300' : feedMode === 'DEMO' ? 'border-amber-400/20 bg-amber-400/[.06] text-amber-300' : 'border-slate-400/20 bg-slate-400/[.06] text-slate-400'}`}>{feedMode === 'LIVE' ? 'Live provider connected' : feedMode === 'DEMO' ? 'Demo dataset' : 'Feed status unknown'}</span></div>
      ) : (
        <>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">{selections.map((s, index) => <div key={s.id} className="group relative overflow-hidden rounded-xl border border-white/[.07] bg-white/[.035] p-3 transition hover:border-violet-400/20 hover:bg-white/[.055]"><div className="flex items-start justify-between gap-2"><div className="flex min-w-0 gap-2.5"><span className="mt-0.5 font-mono text-[9px] text-slate-600">{String(index + 1).padStart(2,'0')}</span><div className="min-w-0"><div className="truncate text-xs font-bold text-slate-100">{s.shortName}</div><div className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">{s.risk} risk · <span className="text-violet-300">@ {s.odds.toFixed(2)}</span></div></div></div><button type="button" aria-label={`Remove ${s.shortName}`} onClick={() => onRemove(s.id)} className="shrink-0 rounded-lg border border-white/10 px-2 py-1 text-[10px] text-slate-500 transition hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-300">✕</button></div></div>)}</div>
          <div className="space-y-3 border-t border-white/[.08] bg-black/10 p-4">
            {stats.warnings.length > 0 ? <div role="alert" className="rounded-xl border border-amber-400/20 bg-amber-400/[.06] p-3 text-[10px] leading-snug text-amber-200"><div className="mb-1 font-black uppercase tracking-[.14em] text-amber-300">Correlation warning</div>{stats.warnings[0]}</div> : null}
            <label className="block text-[9px] font-bold uppercase tracking-[.16em] text-slate-500">Stake<input type="number" min={0} step="0.01" inputMode="decimal" value={Number.isFinite(stake) && stake >= 0 ? stake : 0} onChange={(e) => { const next = Number(e.target.value); if (Number.isFinite(next) && next >= 0) onUpdateStake(next); }} className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#080c13] px-3 py-2.5 text-sm font-semibold text-white outline-none transition focus:border-violet-400/50" /></label>
            <div className="grid grid-cols-2 gap-2">{[['Combined odds',stats.multi.toFixed(2)],['Potential return',stats.ret.toFixed(2)],['Probability',`${Math.round(stats.estProb*100)}%`],['EV',`${stats.ev>=0?'+':''}${(stats.ev*100).toFixed(1)}%`]].map(([label,value])=><div key={label} className="rounded-xl border border-white/[.07] bg-white/[.025] p-2.5"><div className="text-[8px] uppercase tracking-wider text-slate-600">{label}</div><div className={`mt-1 text-sm font-black ${label==='EV'&&stats.ev>=0?'text-emerald-300':'text-white'}`}>{value}</div></div>)}</div>
            <div className="flex items-center justify-between rounded-xl border border-white/[.07] bg-white/[.02] px-3 py-2"><span className="text-[9px] font-bold uppercase tracking-[.15em] text-slate-500">Risk profile</span><RiskBadge risk={stats.risk as never} /></div>
            <div className="grid grid-cols-2 gap-2"><button type="button" onClick={onAnalyze} className="rounded-xl border border-violet-400/30 bg-violet-500/15 px-3 py-2.5 text-xs font-bold text-violet-100 shadow-[0_0_25px_rgba(124,92,255,.08)] transition hover:border-violet-300/50 hover:bg-violet-500/25">Analyze</button><button type="button" onClick={onOptimize} className="rounded-xl border border-white/12 bg-white/[.055] px-3 py-2.5 text-xs font-bold text-white transition hover:border-white/25 hover:bg-white/10">Optimize</button></div>
            <button type="button" onClick={onClear} className="w-full rounded-xl border border-red-400/15 bg-red-400/[.035] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-red-300/80 transition hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-200">Clear builder</button>
            <div className="flex items-center justify-center gap-1.5 pt-1"><span className={feedMode === 'LIVE' ? 'live-dot h-1.5 w-1.5 rounded-full bg-emerald-400' : feedMode === 'DEMO' ? 'live-dot h-1.5 w-1.5 rounded-full bg-amber-400' : 'live-dot h-1.5 w-1.5 rounded-full bg-slate-500'} aria-hidden /><span className="text-[9px] font-bold uppercase tracking-[.16em] text-slate-600">{feedMode === 'LIVE' ? 'Live odds · Core Engine' : feedMode === 'DEMO' ? 'Demo data · Core Engine' : 'Feed unavailable · Core Engine'</span></div>
          </div>
        </>
      )}
    </aside>
  );
}
