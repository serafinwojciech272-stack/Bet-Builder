import { useMemo } from 'react';
import { ArrowUpRight, Brain, ShieldCheck, Sparkles } from 'lucide-react';
import { getDataset, analyzeSelectionDeterministic } from '../services/services';
import { DemoBadge, Panel, RiskBadge, SectionHeading, Stat } from '../components/ui';

export default function AnalysisPage() {
  const dataset = getDataset();
  const analyzed = useMemo(() => dataset.selections.map((s) => ({ selection: s, analysis: analyzeSelectionDeterministic(s) })), [dataset]);

  return (
    <div className="space-y-8 rise">
      <section className="relative overflow-hidden rounded-2xl border border-ai/20 bg-gradient-to-br from-ai/[0.12] via-surface/[0.96] to-surface-2 p-6 shadow-[0_24px_80px_rgba(0,0,0,.28)] sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-ai/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full border border-ai/30 bg-ai/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[.16em] text-ai"><Brain size={11} /> Intelligence Layer</span><DemoBadge label="DEMO / DETERMINISTIC" /></div>
            <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Analysis workspace</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Transparent selection-level analysis with explicit probability, implied price, value, EV and risk signals.</p>
          </div>
          <div className="hidden items-center gap-2 rounded-xl border border-white/[.07] bg-black/20 px-3 py-2 font-mono text-[9px] uppercase tracking-[.14em] text-faint sm:flex"><ShieldCheck size={12} className="text-positive" /> governed output</div>
        </div>
      </section>

      <SectionHeading index="01" title="Selection intelligence" subtitle={`${analyzed.length} selections · deterministic demo analysis · no real predictions`} icon={<Sparkles size={17} className="text-ai" />} />
      <div className="grid gap-4 lg:grid-cols-2">
        {analyzed.map(({ selection, analysis }) => (
          <Panel key={selection.id} className="group p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-ai/35 hover:shadow-[0_18px_50px_rgba(0,0,0,.24)]">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0"><div className="font-mono text-[9px] uppercase tracking-[.15em] text-faint">{selection.marketId}</div><div className="mt-1 text-base font-semibold text-foreground">{selection.shortName}</div><div className="mt-1 font-mono text-xs text-market">@ {selection.odds.toFixed(2)}</div></div>
              <RiskBadge risk={analysis.risk} />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
              <div className="bg-surface-2 p-3"><Stat label="Model prob" value={`${Math.round(analysis.probability * 100)}%`} /></div>
              <div className="bg-surface-2 p-3"><Stat label="Implied" value={`${Math.round(analysis.impliedProbability * 100)}%`} /></div>
              <div className="bg-surface-2 p-3"><Stat label="Value" tone={analysis.value >= 0 ? 'positive' : 'negative'} value={`${analysis.value >= 0 ? '+' : ''}${Math.round(analysis.value * 100)}%`} /></div>
              <div className="bg-surface-2 p-3"><Stat label="EV" tone={analysis.ev >= 0 ? 'positive' : 'negative'} value={`${analysis.ev >= 0 ? '+' : ''}${(analysis.ev * 100).toFixed(1)}%`} /></div>
            </div>
            <div className="mt-4 rounded-xl bg-white/[.025] p-3 ring-1 ring-white/[.05]"><div className="text-[10px] font-semibold uppercase tracking-[.14em] text-faint">Interpretation</div><p className="mt-1.5 text-xs leading-5 text-muted"><span className="font-semibold text-foreground">Why:</span> {analysis.explanation}</p></div>
            <div className="mt-3 flex flex-wrap gap-1.5">{analysis.factors.map((f) => <span key={f} className="rounded-full border border-line bg-surface-3 px-2 py-1 text-[10px] text-muted">{f}</span>)}</div>
            {analysis.warnings.length > 0 ? <div className="mt-3 flex items-start gap-2 rounded-lg border border-warn/25 bg-warn/[.05] px-3 py-2 text-[10px] leading-4 text-warn"><ArrowUpRight size={12} className="mt-0.5 shrink-0" />{analysis.warnings.join(' · ')}</div> : null}
          </Panel>
        ))}
      </div>
    </div>
  );
}
