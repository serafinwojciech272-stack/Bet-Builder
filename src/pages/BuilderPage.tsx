import { useMemo, useState } from 'react';
import { BuilderPanel } from '../components/BuilderPanel';
import { DecisionCenter } from '../components/DecisionCenter';
import { liveEvents } from '../services/liveAdapter';
import { useIntelligence } from '../state/IntelligenceProvider';
import { evaluateDecisionCenter } from '../core/decisionCenter';
import type { OptimizationResult } from '../core/types';

interface Props {
  selections: import('../domain/types').Selection[];
  stake: number;
  addSelection: (s: import('../domain/types').Selection) => void;
  removeSelection: (id: string) => void;
  clear: () => void;
  updateStake: (v: number) => void;
}

export default function BuilderPage({ selections, stake, addSelection, removeSelection, clear, updateStake }: Props) {
  const { dataset, phase, error, runAnalysis, optimizeBuilder, selectedDate } = useIntelligence();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [optimization, setOptimization] = useState<OptimizationResult | null>(null);
  const events = useMemo(() => (dataset ? liveEvents(dataset) : []), [dataset]);
  const decision = useMemo(() => evaluateDecisionCenter(selections), [selections]);
  const isAdded = (id: string) => selections.some((s) => s.id === id);

  const onAnalyze = async () => {
    if (!selections.length) return;
    const eventIds = [...new Set(selections.map((s) => s.eventId))];
    const results = await Promise.all(eventIds.map((eventId) => runAnalysis(eventId, { depth: 'deep' })));
    const completed = results.filter(Boolean).length;
    setMessage(`Core Intelligence: ${completed}/${eventIds.length} event analyses completed at deep depth.`);
  };

  const onOptimize = async () => {
    if (!selections.length) return;
    const result = await optimizeBuilder({
      stake, minEv: 0, maxSelections: 8, maxPerCorrelationGroup: 1, minConfidence: 0.5,
      selections: selections.map((s) => ({ id: s.id, odds: s.odds, probability: s.probability, correlationGroup: s.correlationGroup, confidence: s.confidence, risk: s.risk })),
    });
    setOptimization(result);
    if (result) setMessage(`Core Optimizer: ${result.selections.length} retained, ${result.rejectedSelections.length} filtered · diversification ${(result.diversificationScore * 100).toFixed(0)}%.`);
  };

  if (phase === 'loading' && !dataset) return <main className="mx-auto max-w-[1400px] px-4 py-10 text-slate-300">Loading live builder data…</main>;
  if (phase === 'error' && !dataset) return <main className="mx-auto max-w-[1400px] px-4 py-10"><div className="rounded-xl border border-red-400/20 bg-red-400/5 p-6 text-slate-300">{error ?? 'Live odds unavailable.'}</div></main>;

  return <main className="mx-auto w-full max-w-[1400px] px-4 py-6 pb-28 md:pb-10">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><div className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-300">CORE INTELLIGENCE BUILDER</div><h1 className="mt-1 text-xl font-black tracking-tight text-white">Bet Builder</h1><div className="mt-1 text-xs text-slate-500">Live provider offer · {selectedDate}</div></div>
      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1.5 text-[11px] font-bold text-emerald-300">LIVE ODDS</span>
    </div>
    {message ? <div role="status" className="mt-3 rounded-md border border-violet-500/40 bg-violet-500/10 p-3 text-sm text-violet-200">{message}</div> : null}
    {optimization ? <div className="mt-3 grid gap-2 sm:grid-cols-4"><div className="rounded-md border border-white/10 bg-white/[0.02] p-3"><div className="text-[10px] uppercase tracking-wider text-slate-500">Combined odds</div><div className="mt-1 text-lg font-bold text-white">{optimization.combinedOdds.toFixed(2)}</div></div><div className="rounded-md border border-white/10 bg-white/[0.02] p-3"><div className="text-[10px] uppercase tracking-wider text-slate-500">Estimated EV</div><div className={`mt-1 text-lg font-bold ${optimization.estimatedEv >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{(optimization.estimatedEv * 100).toFixed(1)}%</div></div><div className="rounded-md border border-white/10 bg-white/[0.02] p-3"><div className="text-[10px] uppercase tracking-wider text-slate-500">Probability</div><div className="mt-1 text-lg font-bold text-white">{(optimization.estimatedProbability * 100).toFixed(1)}%</div></div><div className="rounded-md border border-white/10 bg-white/[0.02] p-3"><div className="text-[10px] uppercase tracking-wider text-slate-500">Diversification</div><div className="mt-1 text-lg font-bold text-violet-200">{(optimization.diversificationScore * 100).toFixed(0)}%</div></div></div> : null}
    <DecisionCenter result={decision} />
    <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="space-y-5"><section aria-label="Events"><h2 className="text-[12px] font-bold uppercase tracking-[0.2em] text-slate-400 border-b border-white/10 pb-2">Live Events</h2><div className="mt-3 space-y-2">
        {events.map((e) => <div key={e.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-3"><div className="flex items-center justify-between gap-2"><div className="min-w-0"><div className="text-sm font-bold text-white truncate">{e.homeTeam} vs {e.awayTeam}</div><div className="text-[11px] uppercase tracking-wider text-slate-400">{e.sport} · {e.league}</div></div><div className="text-[11px] text-slate-500">{new Date(e.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div></div><div className="mt-2 flex flex-wrap gap-1.5">{e.markets.flatMap((m) => m.selections).map((s) => { const added = isAdded(s.id); return <button key={s.id} type="button" aria-pressed={added} onClick={() => (added ? removeSelection(s.id) : addSelection(s))} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${added ? 'border-violet-500/60 bg-violet-500/20 text-violet-100' : 'border-white/15 bg-white/5 text-slate-300 hover:border-violet-500/40 hover:text-white'}`}>{s.shortName} {s.odds.toFixed(2)}</button>; })}</div></div>)}
        {!events.length ? <div className="rounded-lg border border-white/10 p-8 text-center text-sm text-slate-500">No live provider events for {selectedDate}.</div> : null}
      </div></section></div>
      <div className="hidden lg:block"><div className="sticky top-20"><BuilderPanel selections={selections} stake={stake} onUpdateStake={updateStake} onClear={clear} onRemove={removeSelection} onAnalyze={() => void onAnalyze()} onOptimize={() => void onOptimize()} /></div></div>
    </div>
    <div className="lg:hidden"><button type="button" onClick={() => setDrawerOpen(true)} className="fixed bottom-[64px] inset-x-3 z-40 rounded-lg border border-violet-500/50 bg-[#151927] p-3 text-left shadow-2xl"><div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-white">{selections.length} selection(s)</span><span className="text-sm text-violet-300">Open Builder</span></div></button></div>
    {drawerOpen ? <div className="fixed inset-0 z-50 lg:hidden"><div className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} aria-hidden /><div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-xl border-t border-white/15 bg-[#0e1118] p-3 pb-6"><div className="mb-2 flex items-center justify-between"><div className="text-sm font-bold uppercase tracking-widest text-white">Bet Builder</div><button type="button" aria-label="Close builder" onClick={() => setDrawerOpen(false)} className="rounded border border-white/15 px-2 py-1 text-slate-300">✕</button></div><BuilderPanel selections={selections} stake={stake} onUpdateStake={updateStake} onClear={clear} onRemove={removeSelection} onAnalyze={() => void onAnalyze()} onOptimize={() => void onOptimize()} /></div></div> : null}
  </main>;
}
