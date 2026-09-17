import type { DecisionCenterResult } from '../core/decisionCenter';

function pct(v: number) { return `${(v * 100).toFixed(0)}%`; }
function tone(status: DecisionCenterResult['status']) { return status === 'READY' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : status === 'CAUTION' ? 'border-amber-400/30 bg-amber-400/10 text-amber-300' : 'border-red-400/30 bg-red-400/10 text-red-300'; }

export function DecisionCenter({ result }: { result: DecisionCenterResult }) {
  return <section className="mt-5 rounded-xl border border-white/10 bg-[#0b0f16] p-4 shadow-2xl shadow-black/20" aria-label="Core Engine Decision Center">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
      <div><div className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-300">CORE ENGINE</div><h2 className="mt-1 text-base font-black text-white">Decision Center</h2><p className="mt-1 text-xs text-slate-500">Portfolio audit before review. Deterministic snapshot, provider-ready.</p></div>
      <span className={`rounded-full border px-3 py-1 text-[11px] font-black tracking-wider ${tone(result.status)}`}>{result.status}</span>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-6">
      {[['Odds', result.combinedOdds.toFixed(2)], ['Probability', pct(result.adjustedProbability)], ['EV', `${result.ev >= 0 ? '+' : ''}${(result.ev * 100).toFixed(1)}%`], ['Confidence', pct(result.confidence)], ['Quality', pct(result.quality)], ['Dependency', result.dependencyMultiplier.toFixed(3)]].map(([label, value]) => <div key={label} className="rounded-lg border border-white/10 bg-white/[0.025] p-3"><div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{label}</div><div className="mt-1 text-sm font-black text-white">{value}</div></div>)}
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
        <div className="mb-2 flex items-center justify-between"><h3 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Leg audit</h3><span className="text-[10px] text-slate-600">edge · EV · confidence</span></div>
        <div className="space-y-2">{result.legDecisions.map((leg) => <div key={leg.selection.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-md border border-white/5 bg-black/10 p-2"><div className="min-w-0"><div className="truncate text-xs font-semibold text-white">{leg.selection.shortName}</div><div className="mt-0.5 text-[10px] text-slate-500">implied {pct(leg.implied)} · risk {leg.risk}</div></div><div className={`text-xs font-bold ${leg.edge >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{leg.edge >= 0 ? '+' : ''}{(leg.edge * 100).toFixed(1)}%</div><div className="text-xs font-bold text-slate-300">{pct(leg.confidence)}</div></div>)}</div>
      </div>
      <div className="space-y-3">
        {result.blockers.length ? <div className="rounded-lg border border-red-400/20 bg-red-400/5 p-3"><div className="text-[10px] font-black uppercase tracking-wider text-red-300">Blockers</div>{result.blockers.map((x) => <div key={x} className="mt-1 text-xs text-red-200">{x}</div>)}</div> : null}
        {result.warnings.length ? <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3"><div className="text-[10px] font-black uppercase tracking-wider text-amber-300">Warnings</div>{result.warnings.map((x) => <div key={x} className="mt-1 text-xs text-amber-200">{x}</div>)}</div> : null}
        {result.strengths.length ? <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3"><div className="text-[10px] font-black uppercase tracking-wider text-emerald-300">Signals</div>{result.strengths.map((x) => <div key={x} className="mt-1 text-xs text-emerald-200">{x}</div>)}</div> : null}
      </div>
    </div>
    <details className="mt-4 rounded-lg border border-white/10 bg-black/10 p-3"><summary className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-slate-400">Decision trace</summary><div className="mt-2 space-y-1">{result.trace.map((x) => <div key={x} className="font-mono text-[10px] text-slate-500">› {x}</div>)}</div></details>
  </section>;
}
