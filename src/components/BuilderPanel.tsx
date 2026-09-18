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
  onSaveMission: () => void;
  feedMode?: 'LIVE' | 'DEMO' | 'UNKNOWN';
}

export function BuilderPanel({ selections, stake, onUpdateStake, onClear, onRemove, onAnalyze, onOptimize, onSaveMission, feedMode = 'UNKNOWN' }: Props) {
  const stats = useBuilderStats(selections, stake);
  const empty = selections.length === 0;
  const modeLabel = feedMode === 'LIVE' ? 'Prawdziwe kursy · ParlayAPI' : feedMode === 'DEMO' ? 'Tryb demonstracyjny' : 'Źródło kursów niedostępne';

  return (
    <aside className="glass-strong glow-ai flex h-full flex-col overflow-hidden rounded-2xl">
      <div className="relative border-b border-white/[.08] px-4 py-4">
        <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative flex items-center justify-between gap-3">
          <div>
            <div className="text-[9px] font-black uppercase tracking-[.24em] text-violet-300">COUPON LAB</div>
            <h2 className="mt-1 text-xl font-black tracking-tight text-white">Twój kupon</h2>
          </div>
          <span className="rounded-full border border-violet-400/25 bg-violet-400/10 px-2.5 py-1 text-[11px] font-black text-violet-200">{selections.length} TYPÓW</span>
        </div>
      </div>

      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-400/10 text-xl text-violet-200">+</div>
          <div>
            <div className="text-sm font-semibold text-slate-200">Kupon jest pusty</div>
            <div className="mt-1 max-w-[230px] text-xs leading-relaxed text-slate-500">Wybierz konkretne rynki z tablicy meczów. Każdy typ trafia tutaj jako osobna noga kuponu.</div>
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.16em] ${feedMode === 'LIVE' ? 'border-emerald-400/20 bg-emerald-400/[.06] text-emerald-300' : feedMode === 'DEMO' ? 'border-amber-400/20 bg-amber-400/[.06] text-amber-300' : 'border-slate-400/20 bg-slate-400/[.06] text-slate-400'}`}>{modeLabel}</span>
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {selections.map((s, index) => (
              <div key={s.id} className="group rounded-xl border border-white/[.07] bg-white/[.035] p-3 transition hover:border-violet-400/20 hover:bg-white/[.055]">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-violet-400/10 font-mono text-[9px] text-violet-300">{String(index + 1).padStart(2, '0')}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-bold leading-snug text-slate-100">{s.shortName}</div>
                    <div className="mt-1 flex items-center gap-2 text-[9px] uppercase tracking-wider text-slate-500">
                      <span>{s.risk} risk</span><span className="text-slate-700">·</span><span className="font-mono text-violet-300">@ {s.odds.toFixed(2)}</span>
                    </div>
                  </div>
                  <button type="button" aria-label={`Usuń ${s.shortName}`} onClick={() => onRemove(s.id)} className="shrink-0 rounded-lg border border-white/10 px-2 py-1 text-[10px] text-slate-500 transition hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-300">✕</button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3 border-t border-white/[.08] bg-black/10 p-4">
            {stats.warnings.length > 0 ? (
              <div role="alert" className="rounded-xl border border-amber-400/20 bg-amber-400/[.06] p-3 text-[10px] leading-snug text-amber-200">
                <div className="mb-1 font-black uppercase tracking-[.14em] text-amber-300">Uwaga: zależność typów</div>
                {stats.warnings[0]}
              </div>
            ) : null}

            <label className="block text-[9px] font-bold uppercase tracking-[.16em] text-slate-500">
              Stawka
              <div className="relative mt-1.5">
                <input type="number" min={0} step="0.01" inputMode="decimal" value={Number.isFinite(stake) && stake >= 0 ? stake : 0} onChange={(e) => { const next = Number(e.target.value); if (Number.isFinite(next) && next >= 0) onUpdateStake(next); }} className="w-full rounded-xl border border-white/10 bg-[#080c13] px-3 py-2.5 pr-12 text-sm font-semibold text-white outline-none transition focus:border-violet-400/50" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-600">PLN</span>
              </div>
            </label>

            <div className="rounded-2xl border border-violet-400/15 bg-violet-500/[.045] p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-[.16em] text-violet-300">Podsumowanie kuponu</span>
                <span className="text-[9px] text-slate-600">{selections.length} zdarzeń</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><div className="text-[8px] uppercase tracking-wider text-slate-600">Łączny kurs</div><div className="mt-1 text-xl font-black text-white">{stats.multi.toFixed(2)}</div></div>
                <div><div className="text-[8px] uppercase tracking-wider text-slate-600">Możliwa wypłata</div><div className="mt-1 text-xl font-black text-emerald-300">{stats.ret.toFixed(2)} PLN</div></div>
                <div><div className="text-[8px] uppercase tracking-wider text-slate-600">Szac. prawdop.</div><div className="mt-1 text-sm font-black text-white">{Math.round(stats.estProb * 100)}%</div></div>
                <div><div className="text-[8px] uppercase tracking-wider text-slate-600">Model EV</div><div className={`mt-1 text-sm font-black ${stats.ev >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{stats.ev >= 0 ? '+' : ''}{(stats.ev * 100).toFixed(1)}%</div></div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/[.07] bg-white/[.02] px-3 py-2">
              <span className="text-[9px] font-bold uppercase tracking-[.15em] text-slate-500">Profil ryzyka</span>
              <RiskBadge risk={stats.risk as never} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={onAnalyze} className="rounded-xl border border-violet-400/30 bg-violet-500/15 px-3 py-2.5 text-xs font-bold text-violet-100 shadow-[0_0_25px_rgba(124,92,255,.08)] transition hover:border-violet-300/50 hover:bg-violet-500/25">Deep Analyze</button>
              <button type="button" onClick={onOptimize} className="rounded-xl border border-white/12 bg-white/[.055] px-3 py-2.5 text-xs font-bold text-white transition hover:border-white/25 hover:bg-white/10">Optimize</button>
            </div>
            <button type="button" onClick={onSaveMission} className="w-full rounded-xl border border-emerald-400/20 bg-emerald-400/[.06] px-3 py-2.5 text-xs font-bold text-emerald-200 transition hover:border-emerald-300/40 hover:bg-emerald-400/[.12]">Przekaż do Approval Gate</button>
            <button type="button" onClick={onClear} className="w-full rounded-xl border border-red-400/15 bg-red-400/[.035] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-red-300/80 transition hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-200">Wyczyść kupon</button>
            <div className="flex items-center justify-center gap-1.5 pt-1"><span className={`live-dot h-1.5 w-1.5 rounded-full ${feedMode === 'LIVE' ? 'bg-emerald-400' : 'bg-amber-400'}`} aria-hidden /><span className="text-[9px] font-bold uppercase tracking-[.16em] text-slate-600">{modeLabel}</span></div>
          </div>
        </>
      )}
    </aside>
  );
}
