import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownUp, BookmarkPlus, ChevronDown, Hand, RefreshCw, Shuffle, Sparkles, Trash2, Repeat2, LineChart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSlip } from '../state/SlipProvider';
import { useIntelligence } from '../state/IntelligenceProvider';
import { liveEvents } from '../services/liveAdapter';
import {
  generateCoupon, removeCouponLeg, swapCouponLeg,
  type CouponLeg, type CouponMode, type CouponRequest, type CouponResult,
} from '../core/couponEngine';
import { evaluateRiskPolicy } from '../core/riskPolicy';

const TARGETS = ['2', '5', '10', '25', '50', '100'] as const;
const STAKES = ['10', '20', '50', '100'] as const;

const WARNING_COPY: Record<string, string> = {
  NEGATIVE_EV: 'Brak przewagi: kursy są poniżej uczciwej wyceny rynku (marża bukmachera). Na dłuższą metę taki kupon traci.',
  TARGET_NOT_REACHED: 'Z dostępnych meczów nie da się trafić dokładnie w cel — pokazano najbliższy możliwy kupon.',
  ZERO_STAKE: 'Stawka wynosi 0 PLN.',
  NO_SWAP_AVAILABLE: 'Brak innego meczu do podmiany przy obecnych filtrach.',
};

function couponMessage(c: CouponResult): string {
  if (c.blockers.includes('NO_VALUE_SELECTIONS')) return 'Brak typów z przewagą nad rynkiem w aktualnym feedzie. Przełącz na „Najlepsze kursy” albo wróć później.';
  if (c.blockers.includes('NO_QUALIFIED_SELECTIONS')) return `Żaden mecz nie spełnia filtrów (kurs 1.20–6.00). W puli: ${c.poolSize} meczów.`;
  if (c.blockers.includes('TARGET_ODDS_INVALID')) return 'Podaj docelowy kurs większy niż 1.';
  return 'Nie udało się zbudować kuponu.';
}

const pln = (n: number) => n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const oneIn = (p: number) => (p > 0 ? Math.max(1, Math.round(1 / p)) : 0);
const kickoff = (iso: string) => new Date(iso).toLocaleString('pl-PL', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** Animated number that eases from the previous value to the new one. */
function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduced) { setShown(value); from.current = value; return; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 700);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(a + (value - a) * eased);
      if (k < 1) raf = requestAnimationFrame(tick); else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);
  return <span className="fl-num">{format(shown)}</span>;
}

function StadiumBackdrop() {
  return (
    <div aria-hidden="true">
      <div className="fl-beams">
        <span className="fl-lamp fl-lamp--l" /><span className="fl-lamp fl-lamp--r" />
        <span className="fl-beam fl-beam--l" /><span className="fl-beam fl-beam--r" />
      </div>
      <svg className="fl-pitch" viewBox="0 0 1050 680" fill="none" strokeWidth="3">
        <rect x="5" y="5" width="1040" height="670" />
        <line x1="525" y1="5" x2="525" y2="675" />
        <circle cx="525" cy="340" r="92" />
        <rect x="5" y="138" width="165" height="404" /><rect x="880" y="138" width="165" height="404" />
        <rect x="5" y="248" width="55" height="184" /><rect x="990" y="248" width="55" height="184" />
      </svg>
    </div>
  );
}

type SortKey = 'time' | 'odds' | 'chance';

export default function CouponLabPage() {
  const { dataset, selectedDate, refresh, runAnalysis, phase } = useIntelligence();
  const [target, setTarget] = useState('10');
  const [stake, setStake] = useState('20');
  const [mode, setMode] = useState<CouponMode>('BEST_AVAILABLE');
  const [result, setResult] = useState<CouponResult | null>(null);
  const [request, setRequest] = useState<CouponRequest | null>(null);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [ai, setAi] = useState<Record<string, 'loading' | 'ok' | 'failed'>>({});
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('time');
  const [flipKey, setFlipKey] = useState(0);
  const events = useMemo(() => (dataset ? liveEvents(dataset) : []), [dataset]);
  const slip = useSlip();
  const [useMine, setUseMine] = useState(true);
  const [savedId, setSavedId] = useState<string | null>(null);
  const mine = useMine ? slip.picks.map((p) => p.selectionId) : [];
  const mineEvents = new Set(slip.picks.map((p) => p.eventId));

  const generate = async (opts: { target?: string; stake?: string; mode?: CouponMode; exclude?: string[]; locked?: string[] } = {}) => {
    if (!dataset) { setMessage('Brak danych. Odśwież źródło.'); return; }
    const req: CouponRequest = {
      events, targetOdds: Number(opts.target ?? target), stake: Number(opts.stake ?? stake),
      tolerance: 0.2, maxLegs: 10, minLegOdds: 1.2, maxLegOdds: 6, minConfidence: 0.5,
      mode: opts.mode ?? mode, excludeEventIds: opts.exclude ?? [], lockedSelectionIds: opts.locked ?? mine,
    };
    const coupon = generateCoupon(req);
    setRequest(req); setExcluded(opts.exclude ?? []); setResult(coupon); setOpen(null); setFlipKey((k) => k + 1); setSavedId(null);
    if (coupon.status === 'BLOCKED') { setMessage(couponMessage(coupon)); return; }
    setMessage('');
    const next: Record<string, 'loading' | 'ok' | 'failed'> = {};
    coupon.legs.forEach((l) => { next[l.eventId] = 'loading'; });
    setAi(next);
    await Promise.all(coupon.legs.map(async (leg) => {
      try {
        const analysis = await runAnalysis(leg.eventId, { depth: 'deep' });
        setAi((p) => ({ ...p, [leg.eventId]: analysis ? 'ok' : 'failed' }));
      } catch {
        setAi((p) => ({ ...p, [leg.eventId]: 'failed' }));
      }
    }));
  };

  const swapLeg = (eventId: string) => {
    if (!request || !result) return;
    const nextReq = { ...request, excludeEventIds: [...(request.excludeEventIds ?? []), eventId] };
    const next = swapCouponLeg(nextReq, result, eventId);
    setRequest(nextReq); setResult(next); setFlipKey((k) => k + 1);
    setMessage(next.warnings.includes('NO_SWAP_AVAILABLE') ? WARNING_COPY.NO_SWAP_AVAILABLE : '');
  };
  const removeLeg = (eventId: string) => {
    if (!request || !result) return;
    if (mineEvents.has(eventId)) slip.remove(eventId);
    setResult(removeCouponLeg(request, result, eventId)); setFlipKey((k) => k + 1);
  };

  const saveCoupon = () => {
    if (!result || !result.legs.length) return;
    const entry = slip.save({
      stake: result.stake, combinedOdds: result.combinedOdds, targetOdds: result.targetOdds,
      probability: result.estimatedProbability, ev: result.estimatedEv,
      legs: result.legs.map((l) => ({ eventId: l.eventId, selectionId: l.selectionId, eventLabel: l.eventLabel, league: l.league, startTime: l.startTime, label: l.label, odds: l.marketOdds, bookmaker: l.bookmaker, probability: l.probability })),
    });
    setSavedId(entry.id);
  };

  const legs = useMemo(() => {
    const list = [...(result?.legs ?? [])];
    if (sort === 'odds') list.sort((a, b) => b.marketOdds - a.marketOdds);
    else if (sort === 'chance') list.sort((a, b) => b.probability - a.probability);
    else list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return list;
  }, [result, sort]);

  const policy = result && result.legs.length ? evaluateRiskPolicy({
    selections: result.legs.map((l) => ({
      id: l.selectionId, marketId: l.marketId, eventId: l.eventId, name: l.label, shortName: l.label, odds: l.marketOdds,
      probability: l.probability, impliedProbability: 1 / l.marketOdds, value: l.edge, ev: l.ev, confidence: l.confidence,
      risk: l.risk, correlationGroup: l.marketId,
    })),
    dataFreshness: dataset?.providerHealth ? Math.max(0, 1 - dataset.providerHealth.ageSeconds / Math.max(1, dataset.providerHealth.staleAfterSeconds)) : 0,
    evidenceQuality: dataset?.providerHealth?.state === 'HEALTHY' ? 0.8 : 0.5,
    providerState: dataset?.providerHealth?.state ?? 'OFFLINE',
  }) : null;

  const pickTarget = (v: string) => { setTarget(v); if (result) void generate({ target: v }); };
  const pickStake = (v: string) => { setStake(v); if (result) void generate({ stake: v }); };
  const pickMode = (m: CouponMode) => { setMode(m); if (result) void generate({ mode: m }); };

  if (phase === 'loading' && !dataset) {
    return <div className="mx-auto max-w-[1200px] px-5 py-12 text-slate-400" role="status">Ładowanie meczów i kursów…</div>;
  }

  const deviation = result?.targetDeviation ?? 0;
  const ageMin = dataset?.providerHealth ? Math.round(dataset.providerHealth.ageSeconds / 60) : null;

  return (
    <main className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-4 md:px-6">
      {/* HERO */}
      <section className="fl-stage rounded-[28px] border border-white/[.07] px-5 pb-8 pt-8 md:px-10 md:pb-12 md:pt-12">
        <StadiumBackdrop />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.28em] text-amber-200/80"><Sparkles size={13} /> Kupon dnia · {selectedDate}</div>
            <h1 className="fl-display mt-3 text-5xl text-white md:text-7xl">ZŁÓŻ KUPON<br /><span className="text-amber-200">POD SWÓJ KURS</span></h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">Wybierz, ile chcesz wygrać. Silnik dobierze mecze tak, by kurs łączny trafił w cel przy najwyższej możliwej szansie — i powie, czy kupon ma przewagę nad rynkiem.</p>
          </div>
          <button type="button" onClick={() => void refresh(selectedDate, true)} className="fl-btn inline-flex items-center gap-2 border border-white/10 bg-black/30 px-4 text-xs font-bold text-white backdrop-blur">
            <RefreshCw size={14} /> Odśwież kursy
          </button>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="min-w-0">
            <div id="target-label" className="text-[10px] font-black uppercase tracking-[.2em] text-slate-400">Docelowy kurs</div>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6" role="group" aria-labelledby="target-label">
              {TARGETS.map((v) => (
                <button key={v} type="button" aria-pressed={target === v} onClick={() => pickTarget(v)} className="fl-chip fl-display text-2xl text-white">x{v}</button>
              ))}
            </div>
            <label className="mt-3 flex max-w-xs items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 text-xs text-slate-400 backdrop-blur">
              Własny
              <input value={target} onChange={(e) => setTarget(e.target.value)} onBlur={() => result && void generate()} inputMode="decimal" type="number" min="1.01" step="0.01" className="w-full bg-transparent py-3 text-base font-bold text-white outline-none" aria-label="Własny docelowy kurs" />
            </label>
          </div>
          <div>
            <div id="stake-label" className="text-[10px] font-black uppercase tracking-[.2em] text-slate-400">Stawka (PLN)</div>
            <div className="mt-2 grid grid-cols-4 gap-2" role="group" aria-labelledby="stake-label">
              {STAKES.map((v) => (
                <button key={v} type="button" aria-pressed={stake === v} onClick={() => pickStake(v)} className="fl-chip text-sm font-black text-white">{v}</button>
              ))}
            </div>
            <div className="mt-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3 backdrop-blur">
              <div className="text-[10px] uppercase tracking-[.16em] text-slate-500">Cel wygranej</div>
              <div className="fl-display mt-1 text-3xl text-white"><CountUp value={Number(stake) * Number(target) || 0} format={pln} /> <span className="text-base text-slate-400">PLN</span></div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void generate()} disabled={!dataset} className="fl-btn fl-cta px-7 py-4 text-sm font-black uppercase tracking-[.12em] disabled:opacity-40">
            Generuj kupon
          </button>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Tryb doboru typów">
            {([['BEST_AVAILABLE', 'Najlepsze kursy'], ['VALUE_ONLY', 'Tylko z przewagą']] as const).map(([m, l]) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => pickMode(m)} className="fl-chip px-4 text-xs font-bold text-slate-200">{l}</button>
            ))}
          </div>
          <span className="text-[11px] text-slate-400">
            {dataset ? `${events.length} meczów · ${dataset.providerHealth?.bookmakerCount ?? '?'} bukmacherów${ageMin !== null ? ` · kursy sprzed ${ageMin} min` : ''}` : 'Brak danych'}
          </span>
        </div>
        {slip.picks.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300/25 bg-black/40 px-4 py-3 backdrop-blur">
            <Hand size={16} className="text-amber-200" />
            <div className="min-w-0 flex-1 text-sm text-slate-200">
              <b className="text-white">{slip.picks.length} {slip.picks.length === 1 ? 'Twój typ' : 'Twoje typy'}</b> z listy meczów · kurs {slip.combinedOdds.toFixed(2)}
              <div className="truncate text-[11px] text-slate-400">{slip.picks.map((p) => `${p.label} @ ${p.odds.toFixed(2)}`).join(' · ')}</div>
            </div>
            <button type="button" aria-pressed={useMine} onClick={() => { const next = !useMine; setUseMine(next); if (result) void generate({ locked: next ? slip.picks.map((p) => p.selectionId) : [] }); }} className="fl-chip px-3 text-xs font-bold text-slate-200">{useMine ? 'Uwzględniam — dobiorę resztę' : 'Pomijam moje typy'}</button>
            <Link to="/" className="fl-btn inline-flex items-center px-3 text-xs font-bold text-amber-200 underline">Zmień typy</Link>
          </div>
        )}
        {message && <div role="status" className="mt-4 rounded-xl border border-amber-300/20 bg-black/40 px-4 py-3 text-sm text-amber-100 backdrop-blur">{message}</div>}
      </section>

      {/* TICKET */}
      {result && result.legs.length > 0 && (
        <section className="mt-6 grid gap-5 lg:grid-cols-[1.6fr_.9fr]" aria-label="Wygenerowany kupon">
          <div className="fl-ticket min-w-0 p-4 md:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[.22em] text-slate-500">Twój kupon · {result.legs.length} {result.legs.length === 1 ? 'mecz' : 'mecze/ów'}</div>
                <div className="fl-display mt-1 text-4xl text-white md:text-5xl">KURS <span key={flipKey} className="fl-flip inline-block text-amber-200">{result.combinedOdds.toFixed(2)}</span></div>
              </div>
              <span className={Math.abs(deviation) <= 0.03 ? 'rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold text-emerald-200' : 'rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-100'}>
                cel x{Number(result.targetOdds).toFixed(2)} · {deviation >= 0 ? '+' : '−'}{Math.abs(deviation * 100).toFixed(1)}%
              </span>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="fl-table sm:min-w-[560px]">
                <thead>
                  <tr>
                    <th scope="col"><button type="button" className="fl-th" onClick={() => setSort('time')} aria-pressed={sort === 'time'}>Mecz {sort === 'time' && <ArrowDownUp size={10} className="inline" />}</button></th>
                    <th scope="col"><span className="fl-th">Typ</span></th>
                    <th scope="col"><button type="button" className="fl-th" onClick={() => setSort('odds')} aria-pressed={sort === 'odds'}>Kurs {sort === 'odds' && <ArrowDownUp size={10} className="inline" />}</button></th>
                    <th scope="col"><button type="button" className="fl-th" onClick={() => setSort('chance')} aria-pressed={sort === 'chance'}>Szansa {sort === 'chance' && <ArrowDownUp size={10} className="inline" />}</button></th>
                    <th scope="col"><span className="sr-only">Akcje</span></th>
                  </tr>
                </thead>
                <tbody>
                  {legs.map((leg, i) => <LegRow key={leg.selectionId + flipKey} leg={leg} index={i} open={open === leg.eventId} onToggle={() => setOpen(open === leg.eventId ? null : leg.eventId)} onSwap={() => swapLeg(leg.eventId)} onRemove={() => removeLeg(leg.eventId)} aiState={ai[leg.eventId]} mine={mineEvents.has(leg.eventId)} />)}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => void generate({ exclude: [...excluded, ...result.legs.map((l) => l.eventId)] })} className="fl-btn inline-flex items-center gap-2 border border-white/10 bg-white/[.03] px-4 text-xs font-bold text-slate-200"><Shuffle size={14} /> Losuj inny zestaw</button>
              {excluded.length > 0 && <button type="button" onClick={() => void generate({ exclude: [] })} className="fl-btn px-3 text-xs font-bold text-slate-400 underline">Wróć do najlepszego</button>}
            </div>
          </div>

          {/* PAYOUT */}
          <aside className="min-w-0 space-y-4">
            <div className="fl-ticket overflow-hidden">
              <div className="p-5">
                <div className="text-[10px] font-black uppercase tracking-[.2em] text-slate-500">Wypłata przy wygranej</div>
                <div className="fl-display mt-2 text-5xl text-white"><CountUp value={result.potentialReturn} format={pln} /><span className="ml-2 text-lg text-slate-400">PLN</span></div>
                <div className="mt-1 text-xs text-slate-400">stawka {pln(result.stake)} PLN × kurs {result.combinedOdds.toFixed(2)}</div>
              </div>
              <div className="fl-ticket__tear" />
              <div className="p-5">
                <div className="flex items-baseline justify-between">
                  <div className="text-[10px] font-black uppercase tracking-[.2em] text-slate-500">Szansa wg rynku</div>
                  <div className="text-sm font-bold text-white">{(result.estimatedProbability * 100).toFixed(1)}%</div>
                </div>
                <div className="fl-meter mt-2"><i key={flipKey} style={{ width: `${Math.max(2, Math.min(100, result.estimatedProbability * 100))}%` }} /></div>
                <p className="mt-2 text-xs text-slate-300">Taki kupon wchodzi średnio <b className="text-white">1 raz na {oneIn(result.estimatedProbability)}</b>.</p>
                <p className={result.estimatedEv > 0 ? 'mt-3 text-xs font-bold text-emerald-300' : 'mt-3 text-xs text-slate-400'}>
                  {result.estimatedEv > 0 ? `Przewaga nad rynkiem: +${(result.estimatedEv * 100).toFixed(1)}%` : `Bez przewagi (${(result.estimatedEv * 100).toFixed(1)}%) — to zakład rozrywkowy, nie inwestycja.`}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={saveCoupon} disabled={Boolean(savedId)} className="fl-btn fl-cta inline-flex flex-1 items-center justify-center gap-2 px-4 text-xs font-black uppercase tracking-[.1em] disabled:opacity-60">
                <BookmarkPlus size={15} /> {savedId ? 'Zapisano' : 'Zapisz kupon'}
              </button>
              {savedId && <Link to="/my" className="fl-btn inline-flex items-center px-3 text-xs font-bold text-amber-200 underline">Moje kupony</Link>}
            </div>

            {result.warnings.filter((w) => w !== 'NEGATIVE_EV').length > 0 && (
              <div className="rounded-2xl border border-amber-300/20 bg-amber-400/[.05] p-4 text-xs leading-5 text-amber-100">
                {result.warnings.filter((w) => w !== 'NEGATIVE_EV').map((w) => WARNING_COPY[w] ?? w).join(' ')}
              </div>
            )}

            <details className="group rounded-2xl border border-white/[.07] bg-white/[.02] p-4 text-xs text-slate-400">
              <summary className="flex cursor-pointer list-none items-center justify-between font-bold text-slate-200">Szczegóły dla analityka <ChevronDown size={14} className="transition-transform group-open:rotate-180" /></summary>
              <ul className="mt-3 space-y-1.5">
                {result.rationale.map((r) => <li key={r}>{r}</li>)}
                <li>Polityka ryzyka: {policy?.decision ?? '—'} {policy?.reasons.length ? `(${policy.reasons.join(', ')})` : ''}</li>
                <li>Źródło: {dataset?.provider ?? '—'} · {dataset?.providerHealth?.state ?? '—'}</li>
              </ul>
            </details>
            <p className="px-1 text-[11px] leading-5 text-slate-500">18+. Zakłady wiążą się z ryzykiem utraty pieniędzy. Graj odpowiedzialnie.</p>
          </aside>
        </section>
      )}
    </main>
  );
}

function LegRow({ leg, index, open, onToggle, onSwap, onRemove, aiState, mine }: {
  leg: CouponLeg; index: number; open: boolean; aiState?: 'loading' | 'ok' | 'failed'; mine?: boolean;
  onToggle: () => void; onSwap: () => void; onRemove: () => void;
}) {
  const detailsId = `leg-${index}-details`;
  return (
    <>
      <tr className="fl-row fl-in" style={{ ['--i' as string]: index }} data-open={open}>
        <td>
          <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={detailsId} className="text-left">
            <div className="text-sm font-bold text-white">{leg.eventLabel}</div>
            <div className="mt-0.5 text-[11px] text-slate-400">{mine && <span className="mr-1 rounded bg-amber-300/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">Twój typ</span>}{leg.league} · {kickoff(leg.startTime)}</div>
          </button>
        </td>
        <td className="text-sm text-slate-200">{leg.label}<div className="text-[10px] text-slate-500">{leg.bookmaker}</div></td>
        <td><span className="fl-odds fl-num fl-flip">{leg.marketOdds.toFixed(2)}</span></td>
        <td>
          <div className="text-sm font-bold text-white">{(leg.probability * 100).toFixed(0)}%</div>
          <div className={leg.ev > 0 ? 'text-[10px] font-bold text-emerald-300' : 'text-[10px] text-slate-500'}>{leg.ev > 0 ? `+${(leg.ev * 100).toFixed(1)}%` : 'bez przewagi'}</div>
        </td>
        <td className="whitespace-nowrap text-right">
          <button type="button" onClick={onSwap} aria-label={`Podmień ${leg.eventLabel}`} title="Podmień" className="fl-btn inline-grid w-11 place-items-center text-slate-300 hover:bg-white/[.06]"><Repeat2 size={16} /></button>
          <button type="button" onClick={onRemove} aria-label={`Usuń ${leg.eventLabel} z kuponu`} title="Usuń" className="fl-btn inline-grid w-11 place-items-center text-slate-500 hover:text-red-300"><Trash2 size={16} /></button>
        </td>
      </tr>
      {open && (
        <tr id={detailsId} className="fl-row">
          <td colSpan={5}>
            <p className="text-xs leading-5 text-slate-200"><b>Dlaczego ten typ: </b>{leg.reason}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
              <span>{aiState === 'loading' ? 'AI analizuje mecz…' : aiState === 'ok' ? 'AI: analiza gotowa' : aiState === 'failed' ? 'AI: analiza niedostępna' : ''}</span>
              <a href={`#/analysis/${encodeURIComponent(leg.eventId)}`} className="inline-flex min-h-[44px] items-center gap-1 font-bold text-cyan-200 hover:underline"><LineChart size={13} /> Pełna analiza meczu</a>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
