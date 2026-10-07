import { useMemo, useState } from 'react';
import { RefreshCw, WalletCards, Target, FileDown, Zap, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useIntelligence } from '../state/IntelligenceProvider';
import { liveEvents } from '../services/liveAdapter';
import { generateCoupon, type CouponResult } from '../core/couponEngine';
import { certifyCoupon, type CouponCertification } from '../core/liveCouponCertificationM181M190';

const QUICK_TARGETS = ['2', '5', '10', '20', '50', '100'];
const SPORTS = [
  { value: 'all', label: 'Wszystkie sporty' },
  { value: 'soccer', label: 'Piłka nożna' },
  { value: 'basketball', label: 'Koszykówka' },
  { value: 'tennis', label: 'Tenis' },
];

function money(value: number) {
  return value.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CouponLabPage() {
  const { dataset, selectedDate, refresh, phase } = useIntelligence();
  const [targetOdds, setTargetOdds] = useState('10');
  const [stake, setStake] = useState('20');
  const [sport, setSport] = useState('all');
  const [maxLegs, setMaxLegs] = useState('5');
  const [result, setResult] = useState<CouponResult | null>(null);
  const [certification, setCertification] = useState<CouponCertification | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const events = useMemo(() => dataset ? liveEvents(dataset) : [], [dataset]);
  const numericStake = Math.max(0, Number(stake) || 0);
  const previewReturn = result ? numericStake * result.combinedOdds : null;

  const generate = async () => {
    setBusy(true);
    setError('');
    try {
      // Always force a fresh server-side dataset before constructing a coupon.
      const source = await refresh(selectedDate, true, sport);
      if (!source) {
        setError('Brak danych sportowych. Odśwież stronę i spróbuj ponownie.');
        return;
      }
      const sourceEvents = liveEvents(source);
      const numericTarget = Math.max(1.01, Number(targetOdds) || 10);
      const numericStakeValue = Math.max(0, Number(stake) || 0);
      const coupon = generateCoupon({
        events: sourceEvents,
        targetOdds: numericTarget,
        stake: numericStakeValue,
        tolerance: .25,
        maxLegs: Math.min(8, Math.max(1, Number(maxLegs) || 5)),
        minLegOdds: 1.15,
        maxLegOdds: 8,
        minConfidence: .50,
        strategy: 'TARGET_ODDS',
      });
      setResult(coupon);
      setCertification(certifyCoupon(source, coupon));
      if (coupon.status === 'BLOCKED') {
        setError(coupon.blockers.join(' · ') || 'Nie znaleziono kwalifikowanych wydarzeń.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się wygenerować kuponu.');
    } finally {
      setBusy(false);
    }
  };

  const printPdf = () => window.print();

  if (phase === 'loading' && !dataset) {
    return <div className="mx-auto max-w-5xl px-5 py-16 text-center text-slate-400">Pobieram aktualne wydarzenia i kursy…</div>;
  }

  const liveStatus = certification?.status === 'CERTIFIED' ? 'KURSY AKTUALNE' : certification?.status === 'REVIEW' ? 'WYMAGA WERYFIKACJI' : certification ? 'BRAK WYSTARCZAJĄCYCH KURSÓW' : 'GOTOWY';

  return (
    <>
      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          body * { visibility: hidden !important; }
          #coupon-print, #coupon-print * { visibility: visible !important; }
          #coupon-print { position: absolute; inset: 0; width: 100%; padding: 24px; color: #111 !important; background: white !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <main className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6 md:py-10">
        <header className="mb-7">
          <div className="text-[10px] font-black uppercase tracking-[.22em] text-violet-300">BET BUILDER</div>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white md:text-5xl">Wygeneruj kupon</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Wybierz docelowy kurs i stawkę. Silnik przeszuka nadchodzące wydarzenia, sprawdzi dostępne kursy i zbuduje kupon możliwie blisko Twojego celu.
          </p>
        </header>

        <section className="glass-strong rounded-3xl border border-white/10 p-5 md:p-7 no-print">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Docelowy kurs</span>
              <div className="mt-2 flex items-center rounded-2xl border border-violet-400/30 bg-black/20 px-4">
                <Target size={18} className="text-violet-300" />
                <input
                  aria-label="Docelowy kurs"
                  value={targetOdds}
                  onChange={(e) => setTargetOdds(e.target.value)}
                  type="number"
                  min="1.01"
                  step="0.1"
                  className="w-full bg-transparent px-3 py-4 text-2xl font-black text-white outline-none"
                />
                <span className="text-xs font-bold text-slate-500">x</span>
              </div>
            </label>

            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Stawka</span>
              <div className="mt-2 flex items-center rounded-2xl border border-amber-400/30 bg-black/20 px-4">
                <WalletCards size={18} className="text-amber-300" />
                <input
                  aria-label="Stawka"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  type="number"
                  min="0"
                  step="1"
                  className="w-full bg-transparent px-3 py-4 text-2xl font-black text-white outline-none"
                />
                <span className="text-xs font-bold text-slate-500">PLN</span>
              </div>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {QUICK_TARGETS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTargetOdds(value)}
                className={targetOdds === value
                  ? 'rounded-xl border border-violet-300/50 bg-violet-400/15 px-4 py-2 text-sm font-black text-violet-100'
                  : 'rounded-xl border border-white/10 bg-white/[.03] px-4 py-2 text-sm font-bold text-slate-300 hover:bg-white/[.07]'}
              >
                x{value}
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Sport</span>
              <select value={sport} onChange={(e) => setSport(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-3 text-sm font-bold text-white outline-none">
                {SPORTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Maksymalna liczba spotkań</span>
              <select value={maxLegs} onChange={(e) => setMaxLegs(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-3 text-sm font-bold text-white outline-none">
                {[2,3,4,5,6,7,8].map((n) => <option key={n} value={n}>{n} spotkań</option>)}
              </select>
            </label>
          </div>

          <button
            type="button"
            onClick={() => void generate()}
            disabled={busy}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-500 px-5 py-4 text-sm font-black text-white transition hover:bg-violet-400 disabled:cursor-wait disabled:opacity-60"
          >
            <Zap size={18} /> {busy ? 'SZUKAM I ANALIZUJĘ…' : 'GENERUJ KUPON'}
          </button>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
            <span>{events.length} wydarzeń w aktualnym zbiorze</span>
            <button type="button" onClick={() => void refresh(selectedDate, true, sport)} className="inline-flex items-center gap-1 font-bold text-slate-300 hover:text-white">
              <RefreshCw size={12} /> Odśwież kursy
            </button>
          </div>
          {error && <div role="alert" className="mt-4 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-xs text-red-200">{error}</div>}
        </section>

        {result && (
          <section id="coupon-print" className="mt-6">
            <div className="glass rounded-3xl border border-white/10 p-5 md:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[.2em] text-violet-300">Gotowy kupon · {selectedDate}</div>
                  <h2 className="mt-2 text-3xl font-black text-white">Kurs x{result.combinedOdds.toFixed(2)}</h2>
                  <p className="mt-1 text-sm text-slate-400">{result.legs.length} spotkań · stawka {money(result.stake)} PLN</p>
                </div>
                <div className="flex gap-2 no-print">
                  <button type="button" onClick={printPdf} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.05] px-4 py-2.5 text-xs font-black text-white">
                    <FileDown size={15} /> PDF
                  </button>
                  <span className={result.status === 'READY' ? 'rounded-xl bg-emerald-400/10 px-3 py-2 text-[10px] font-black text-emerald-300' : 'rounded-xl bg-amber-400/10 px-3 py-2 text-[10px] font-black text-amber-300'}>
                    {result.status}
                  </span>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-white/[.04] p-4">
                  <div className="text-[10px] uppercase text-slate-500">Stawka</div>
                  <div className="mt-1 text-2xl font-black text-white">{money(result.stake)} PLN</div>
                </div>
                <div className="rounded-2xl bg-white/[.04] p-4">
                  <div className="text-[10px] uppercase text-slate-500">Potencjalna wygrana</div>
                  <div className="mt-1 text-2xl font-black text-emerald-300">{money(result.potentialReturn)} PLN</div>
                </div>
                <div className="rounded-2xl bg-white/[.04] p-4">
                  <div className="text-[10px] uppercase text-slate-500">Potencjalny zysk</div>
                  <div className="mt-1 text-2xl font-black text-white">{money(result.potentialProfit)} PLN</div>
                </div>
              </div>

              <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
                <div className="grid grid-cols-[auto_1fr_auto] gap-3 border-b border-white/10 bg-white/[.04] px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500">
                  <span>#</span><span>Spotkanie i typ</span><span>Kurs</span>
                </div>
                {result.legs.map((leg, index) => (
                  <div key={leg.selectionId} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-white/[.06] px-4 py-4 last:border-0">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-400/10 text-xs font-black text-violet-300">{index + 1}</span>
                    <div>
                      <div className="text-sm font-black text-white">{leg.eventLabel}</div>
                      <div className="mt-1 text-xs text-slate-400">{leg.label} · {leg.league}</div>
                      <div className="mt-1 text-[10px] text-slate-500">{new Date(leg.startTime).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}</div>
                    </div>
                    <div className="text-lg font-black text-amber-300">x{leg.marketOdds.toFixed(2)}</div>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Źródło</div>
                  <div className="mt-1 text-sm font-black text-white">{certification?.provenance.provider ?? dataset?.provider ?? '—'}</div>
                  <div className="mt-1 text-xs text-slate-400">{certification?.provenance.bookmakerCount ?? dataset?.snapshots.length ?? 0} snapshotów kursów · {liveStatus}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
                    {certification?.status === 'CERTIFIED' ? <CheckCircle2 size={14} className="text-emerald-400" /> : <AlertTriangle size={14} className="text-amber-400" />}
                    Weryfikacja
                  </div>
                  <div className="mt-1 text-sm font-black text-white">{liveStatus}</div>
                  <div className="mt-1 text-xs text-slate-400">Kupon jest propozycją analityczną. Automatyczne obstawienie pozostaje wyłączone.</div>
                </div>
              </div>

              {previewReturn !== null && Math.abs(previewReturn - result.potentialReturn) > .01 && (
                <div className="mt-3 text-xs text-amber-300">Zmiana stawki: potencjalna wypłata {money(previewReturn)} PLN.</div>
              )}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
