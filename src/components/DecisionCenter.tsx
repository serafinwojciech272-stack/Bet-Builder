import type { DecisionCenterResult } from '../core/decisionCenter';
import type { OptimizationResult } from '../core/types';
import type { Selection } from '../domain/types';

function pct(v: number) { return `${(v * 100).toFixed(0)}%`; }
function tone(status: DecisionCenterResult['status']) { return status === 'READY' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : status === 'CAUTION' ? 'border-amber-400/30 bg-amber-400/10 text-amber-300' : 'border-red-400/30 bg-red-400/10 text-red-300'; }
function delta(v: number, digits = 1) { return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}`; }

export function DecisionCenter({ result, optimization, selections }: { result: DecisionCenterResult; optimization?: OptimizationResult | null; selections: Selection[] }) {
  const selectedIds = new Set(optimization?.selections ?? []);
  const optimized = optimization ? selections.filter((s) => selectedIds.has(s.id)) : [];
  const removed = optimization ? selections.filter((s) => !selectedIds.has(s.id)) : [];
  const rejected = optimization ? optimization.rejectedSelections.map((id) => ({ selection: selections.find((s) => s.id === id), reason: optimization.rejectedReasons[id] ?? 'Rejected by optimizer constraints.' })).filter((x): x is { selection: Selection; reason: string } => Boolean(x.selection)) : [];
  const oddsDelta = optimization ? optimization.combinedOdds - result.combinedOdds : 0;
  const probabilityDelta = optimization ? optimization.estimatedProbability - result.adjustedProbability : 0;
  const evDelta = optimization ? optimization.estimatedEv - result.ev : 0;

  return <section className="mt-5 rounded-xl border border-white/10 bg-[#0b0f16] p-4 shadow-2xl shadow-black/20" aria-label="Core Engine Decision Center">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
      <div><div className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-300">CORE ENGINE · DECISION CENTER 2.0</div><h2 className="mt-1 text-base font-black text-white">Portfolio Decision Packet</h2><p className="mt-1 text-xs text-slate-500">Audit → optimizer → rejected legs → explainable change set → optimized coupon.</p></div>
      <div className="flex items-center gap-2"><span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-bold text-slate-500">{optimization ? 'OPTIMIZER SYNCED' : 'AUDIT ONLY'}</span><span className={`rounded-full border px-3 py-1 text-[11px] font-black tracking-wider ${tone(result.status)}`}>{result.status}</span></div>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-6">
      {[['Odds', result.combinedOdds.toFixed(2)], ['Probability', pct(result.adjustedProbability)], ['EV', `${result.ev >= 0 ? '+' : ''}${(result.ev * 100).toFixed(1)}%`], ['Confidence', pct(result.confidence)], ['Quality', pct(result.quality)], ['Dependency', result.dependencyMultiplier.toFixed(3)]].map(([label, value]) => <div key={label} className="rounded-lg border border-white/10 bg-white/[0.025] p-3"><div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{label}</div><div className="mt-1 text-sm font-black text-white">{value}</div></div>)}
    </div>
    {optimization ? <div className="mt-4 rounded-lg border border-violet-400/20 bg-violet-500/[0.04] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-[10px] font-black uppercase tracking-wider text-violet-300">Engine delta</h3><span className="text-[10px] text-slate-500">submitted → optimized</span></div>
      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-5">
        {[['Legs', `${selections.length} → ${optimized.length}`], ['Odds', `${result.combinedOdds.toFixed(2)} → ${optimization.combinedOdds.toFixed(2)}`], ['Probability', `${pct(result.adjustedProbability)} → ${pct(optimization.estimatedProbability)}`], ['EV', `${delta(result.ev * 100)}% → ${delta(optimization.estimatedEv * 100)}%`], ['Diversification', pct(optimization.diversificationScore)]].map(([label, value]) => <div key={label} className="rounded-md border border-white/10 bg-black/10 p-2"><div className="text-[9px] uppercase tracking-wider text-slate-600">{label}</div><div className="mt-1 text-xs font-bold text-white">{value}</div></div>)}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold"><span className="rounded border border-white/10 px-2 py-1 text-slate-400">Δ odds {delta(oddsDelta, 2)}</span><span className="rounded border border-white/10 px-2 py-1 text-slate-400">Δ probability {delta(probabilityDelta * 100)}pp</span><span className="rounded border border-white/10 px-2 py-1 text-slate-400">Δ EV {delta(evDelta * 100)}pp</span></div>
    </div> : null}
    <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
        <div className="mb-2 flex items-center justify-between"><h3 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Leg audit</h3><span className="text-[10px] text-slate-600">edge · EV · confidence</span></div>
        <div className="space-y-2">{result.legDecisions.map((leg) => { const kept = !optimization || selectedIds.has(leg.selection.id); return <div key={leg.selection.id} className={`grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 rounded-md border p-2 ${kept ? 'border-white/5 bg-black/10' : 'border-red-400/10 bg-red-400/[0.03]'}`}><span className={`rounded px-1.5 py-0.5 text-[8px] font-black ${kept ? 'bg-emerald-400/10 text-emerald-300' : 'bg-red-400/10 text-red-300'}`}>{kept ? 'KEEP' : 'DROP'}</span><div className="min-w-0"><div className="truncate text-xs font-semibold text-white">{leg.selection.shortName}</div><div className="mt-0.5 text-[10px] text-slate-500">implied {pct(leg.implied)} · risk {leg.risk}</div></div><div className={`text-xs font-bold ${leg.edge >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{leg.edge >= 0 ? '+' : ''}{(leg.edge * 100).toFixed(1)}%</div><div className="text-xs font-bold text-slate-300">{pct(leg.confidence)}</div></div>; })}</div>
      </div>
      <div className="space-y-3">
        {result.blockers.length ? <div className="rounded-lg border border-red-400/20 bg-red-400/5 p-3"><div className="text-[10px] font-black uppercase tracking-wider text-red-300">Blockers</div>{result.blockers.map((x) => <div key={x} className="mt-1 text-xs text-red-200">{x}</div>)}</div> : null}
        {result.warnings.length ? <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3"><div className="text-[10px] font-black uppercase tracking-wider text-amber-300">Warnings</div>{result.warnings.map((x) => <div key={x} className="mt-1 text-xs text-amber-200">{x}</div>)}</div> : null}
        {result.strengths.length ? <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3"><div className="text-[10px] font-black uppercase tracking-wider text-emerald-300">Signals</div>{result.strengths.map((x) => <div key={x} className="mt-1 text-xs text-emerald-200">{x}</div>)}</div> : null}
      </div>
    </div>
    {optimization ? <div className="mt-4 grid gap-3 lg:grid-cols-3">
      <div className="rounded-lg border border-emerald-400/15 bg-emerald-400/[0.03] p-3"><div className="text-[10px] font-black uppercase tracking-wider text-emerald-300">Selected</div>{optimized.length ? optimized.map((s) => <div key={s.id} className="mt-1 truncate text-xs text-slate-300">✓ {s.shortName} <span className="text-slate-600">{s.odds.toFixed(2)}</span></div>) : <div className="mt-1 text-xs text-slate-500">No selection survived constraints.</div>}</div>
      <div className="rounded-lg border border-red-400/15 bg-red-400/[0.03] p-3"><div className="text-[10px] font-black uppercase tracking-wider text-red-300">Rejected · WHY</div>{rejected.length ? rejected.map((x) => <div key={x.selection.id} className="mt-1"><div className="truncate text-xs text-slate-300">✕ {x.selection.shortName}</div><div className="text-[10px] text-red-200/70">{x.reason}</div></div>) : <div className="mt-1 text-xs text-slate-500">No explicit optimizer rejection reason.</div>}</div>
      <div className="rounded-lg border border-violet-400/15 bg-violet-400/[0.03] p-3"><div className="text-[10px] font-black uppercase tracking-wider text-violet-300">What changes</div>{removed.length ? removed.map((s) => <div key={s.id} className="mt-1 text-xs text-slate-300">→ Remove {s.shortName}</div>) : <div className="mt-1 text-xs text-slate-500">No removals. Optimizer keeps the submitted set.</div>}<div className="mt-2 border-t border-white/5 pt-2 text-[10px] text-slate-500">Target: {optimization.selections.length} leg(s) · diversification {pct(optimization.diversificationScore)}</div></div>
    </div> : null}
    {optimization ? <div className="mt-4 rounded-lg border border-violet-500/30 bg-violet-500/[0.06] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-[10px] font-black uppercase tracking-wider text-violet-300">Optimized coupon</div><div className="mt-1 text-xs text-slate-400">Engine output after active portfolio constraints.</div></div><div className="text-right"><div className="text-lg font-black text-white">{optimization.combinedOdds.toFixed(2)}</div><div className="text-[10px] text-slate-500">{optimization.selections.length} leg(s)</div></div></div><div className="mt-3 flex flex-wrap gap-1.5">{optimized.map((s) => <span key={s.id} className="rounded-full border border-violet-400/20 bg-violet-400/10 px-2.5 py-1 text-[10px] font-semibold text-violet-100">{s.shortName} · {s.odds.toFixed(2)}</span>)}</div></div> : null}
    <details className="mt-4 rounded-lg border border-white/10 bg-black/10 p-3"><summary className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-slate-400">Decision trace</summary><div className="mt-2 space-y-1">{result.trace.map((x) => <div key={x} className="font-mono text-[10px] text-slate-500">› {x}</div>)}</div></details>
  </section>;
}
