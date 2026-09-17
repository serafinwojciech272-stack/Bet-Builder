import { useState } from 'react';
import { getDataset, correlateWarningsFor } from '../services/services';
import { BuilderPanel } from '../components/BuilderPanel';
import { DemoBadge } from '../components/ui';

interface Props {
  selections: import('../domain/types').Selection[];
  stake: number;
  addSelection: (s: import('../domain/types').Selection) => void;
  removeSelection: (id: string) => void;
  clear: () => void;
  updateStake: (v: number) => void;
}

export default function BuilderPage({ selections, stake, addSelection, removeSelection, clear, updateStake }: Props) {
  const dataset = getDataset();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [message, setMessage] = useState<string>('');
  const isAdded = (id: string) => selections.some((s) => s.id === id);
  const warnings = correlateWarningsFor(selections);

  const onAnalyze = () => {
    setMessage(`Analysis complete for ${selections.length} selection(s) (mock).`);
  };
  const onOptimize = () => {
    setMessage(`Optimization complete — ${selections.length} selection(s) retained (deterministic mock).`);
  };

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-6 pb-28 md:pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black tracking-tight text-white">Bet Builder</h1>
        <DemoBadge />
      </div>
      {message ? (
        <div role="status" className="mt-3 rounded-md border border-violet-500/40 bg-violet-500/10 p-3 text-sm text-violet-200">
          {message}
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <section aria-label="Events">
            <h2 className="text-[12px] font-bold uppercase tracking-[0.2em] text-slate-400 border-b border-white/10 pb-2">
              Events
            </h2>
            <div className="mt-3 space-y-2">
              {dataset.events.map((e) => (
                <div key={e.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white truncate">
                        {e.homeTeam} vs {e.awayTeam}
                      </div>
                      <div className="text-[11px] uppercase tracking-wider text-slate-400">
                        {e.sport} · {e.league}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {dataset.selections
                      .filter((s) => s.eventId === e.id)
                      .map((s) => {
                        const added = isAdded(s.id);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            aria-pressed={added}
                            onClick={() => (added ? removeSelection(s.id) : addSelection(s))}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                              added
                                ? 'border-violet-500/60 bg-violet-500/20 text-violet-100'
                                : 'border-white/15 bg-white/5 text-slate-300 hover:border-violet-500/40 hover:text-white'
                            }`}
                          >
                            {s.shortName} {s.odds.toFixed(2)}
                          </button>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="hidden lg:block">
          <div className="sticky top-20">
            <BuilderPanel
              selections={selections}
              stake={stake}
              onUpdateStake={updateStake}
              onClear={clear}
              onRemove={removeSelection}
              onAnalyze={onAnalyze}
              onOptimize={onOptimize}
            />
          </div>
        </div>
      </div>

      {/* Mobile sticky summary + drawer */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="fixed bottom-[64px] inset-x-3 z-40 rounded-lg border border-violet-500/50 bg-[#151927] p-3 text-left shadow-2xl"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-white">
              {selections.length} selection(s)
            </span>
            <span className="text-sm text-violet-300">Open Builder</span>
          </div>
          {warnings.length > 0 ? (
            <div className="mt-1 text-[11px] text-amber-300">⚠ Correlation warning present</div>
          ) : null}
        </button>
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} aria-hidden />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-xl border-t border-white/15 bg-[#0e1118] p-3 pb-6">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-bold uppercase tracking-widest text-white">Bet Builder</div>
              <button
                type="button"
                aria-label="Close builder"
                onClick={() => setDrawerOpen(false)}
                className="rounded border border-white/15 px-2 py-1 text-slate-300"
              >
                ✕
              </button>
            </div>
            <BuilderPanel
              selections={selections}
              stake={stake}
              onUpdateStake={updateStake}
              onClear={clear}
              onRemove={removeSelection}
              onAnalyze={onAnalyze}
              onOptimize={onOptimize}
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}
