import { useMemo } from 'react';
import { getDataset, analyzeSelectionDeterministic } from '../services/services';
import { DemoBadge, RiskBadge } from '../components/ui';

export default function AnalysisPage() {
  const dataset = getDataset();
  const analyzed = useMemo(
    () =>
      dataset.selections.map((s) => ({
        selection: s,
        analysis: analyzeSelectionDeterministic(s),
      })),
    [dataset],
  );

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-6 pb-24 md:pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black tracking-tight text-white">AI Analysis (Mock)</h1>
        <DemoBadge label="MOCK DETERMINISTIC ANALYSIS" />
      </div>
      <p className="mt-2 text-sm text-slate-400">
        These are deterministic demo analyses generated locally. Not real predictions.
      </p>

      <div className="mt-5 space-y-3">
        {analyzed.map(({ selection, analysis }) => (
          <section key={selection.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm font-bold text-white">
                  {selection.shortName} <span className="text-slate-500">@ {selection.odds.toFixed(2)}</span>
                </div>
                <div className="text-[11px] uppercase tracking-wider text-slate-400">
                  {selection.marketId}
                </div>
              </div>
              <RiskBadge risk={analysis.risk} />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <div className="text-slate-500 text-[11px] uppercase">Model prob</div>
                <div className="text-white font-semibold">{Math.round(analysis.probability * 100)}%</div>
              </div>
              <div>
                <div className="text-slate-500 text-[11px] uppercase">Implied prob</div>
                <div className="text-white font-semibold">{Math.round(analysis.impliedProbability * 100)}%</div>
              </div>
              <div>
                <div className="text-slate-500 text-[11px] uppercase">Value</div>
                <div className={analysis.value >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                  {analysis.value >= 0 ? '+' : ''}{Math.round(analysis.value * 100)}%
                </div>
              </div>
              <div>
                <div className="text-slate-500 text-[11px] uppercase">EV</div>
                <div className={analysis.ev >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                  {analysis.ev >= 0 ? '+' : ''}{(analysis.ev * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            <div className="mt-3 text-sm text-slate-300">
              <span className="font-semibold text-white">Why: </span>
              {analysis.explanation}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {analysis.factors.map((f) => (
                <span key={f} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300">
                  {f}
                </span>
              ))}
            </div>
            {analysis.warnings.length > 0 ? (
              <div className="mt-2 text-[11px] text-amber-300">{analysis.warnings.join(' · ')}</div>
            ) : null}
          </section>
        ))}
      </div>
    </main>
  );
}
