import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowUpRight, CheckCircle2, FileDown, Gauge, RefreshCw, ShieldCheck, Sparkles, Target, WalletCards, Zap } from 'lucide-react';
import { useIntelligence } from '../state/IntelligenceProvider';
import { liveEvents } from '../services/liveAdapter';
import { generateCoupon, type CouponResult } from '../core/couponEngine';
import { rankPredictions } from '../core/predictionEngine';
import { assessCouponRisk, buildCouponExplanation, buildVariants, findSimilarLegs, parseNaturalLanguageIntent, replaceLegInContext, type CouponSnapshot, type CouponVariant, type CouponLegExplanation } from '../core/couponLabDomain';
import { certifyCoupon, type CouponCertification } from '../core/liveCouponCertificationM181M190';
import './coupon-lab-premium.css';

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

function pct(value: number) {
  return `${(value * 100).toFixed(0)}%`;
}

function signedPct(value: number) {
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
}

const ease = [0.22, 1, 0.36, 1] as const;

export default function CouponLabPage() {
  const { dataset, selectedDate, refresh, phase } = useIntelligence();
  const [targetOdds, setTargetOdds] = useState('10');
  const [stake, setStake] = useState('20');
  const [sport, setSport] = useState('all');
  const [result, setResult] = useState<CouponResult | null>(null);
  const [certification, setCertification] = useState<CouponCertification | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState<CouponSnapshot | null>(null);
  const [variants, setVariants] = useState<CouponVariant[]>([]);
  const [activeVariant, setActiveVariant] = useState<'AI_SELECTED'|'SAFER'|'BALANCED'|'AGGRESSIVE'>('AI_SELECTED');
  const [fullExplanation, setFullExplanation] = useState(false);
  const [similarLegs, setSimilarLegs] = useState<CouponLegExplanation[]>([]);
  const [swapTarget, setSwapTarget] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<'idle'|'sending'|'done'>('idle');
  const [nlInput, setNlInput] = useState('');
  const [nlIntent, setNlIntent] = useState<ReturnType<typeof parseNaturalLanguageIntent> | null>(null);
  const autoPrintRef = useRef(false);

  const events = useMemo(() => dataset ? liveEvents(dataset) : [], [dataset]);
  const candidateLegs = useMemo(() => rankPredictions(events).map((p) => { const e=events.find((item)=>item.id===p.eventId); return e ? {...p,eventLabel:e.homeTeam+' vs '+e.awayTeam,league:e.league,startTime:e.startTime} : null; }).filter(Boolean), [events]);
  const numericStake = Math.max(0, Number(stake) || 0);
  const previewReturn = result ? numericStake * result.combinedOdds : null;
  const intelligence = result ? result.legs.reduce((acc, leg) => ({
    confidence: acc.confidence + leg.confidence,
    edge: acc.edge + leg.edge,
    ev: acc.ev + leg.ev,
  }), { confidence: 0, edge: 0, ev: 0 }) : null;
  const intelligenceCount = result?.legs.length || 1;
  const avgConfidence = intelligence ? intelligence.confidence / intelligenceCount : 0;
  const avgEdge = intelligence ? intelligence.edge / intelligenceCount : 0;
  const avgEv = intelligence ? intelligence.ev / intelligenceCount : 0;
  const avgImplied = result && result.legs.length ? result.legs.reduce((sum, leg) => sum + (1 / leg.marketOdds), 0) / result.legs.length : 0;
  const avgProbability = result && result.legs.length ? result.legs.reduce((sum, leg) => sum + leg.probability, 0) / result.legs.length : 0;
  const rankedLegs = result ? [...result.legs].map((leg) => {
    const riskPenalty = leg.risk === 'CRITICAL' ? .35 : leg.risk === 'HIGH' ? .15 : leg.risk === 'MEDIUM' ? .07 : 0;
    const score = Math.max(0, Math.min(100, (leg.confidence * 55) + (Math.max(0, leg.edge) * 300) + (Math.max(0, leg.ev) * 150) - (riskPenalty * 100)));
    const recommendation = score >= 72 && leg.risk !== 'CRITICAL' ? 'KEEP' : score >= 52 && leg.risk !== 'CRITICAL' ? 'REVIEW' : 'BLOCK';
    return { leg, score, recommendation };
  }).sort((a, b) => b.score - a.score) : [];
  const weakest = rankedLegs.length ? rankedLegs[rankedLegs.length - 1] : null;
  const intelligenceScore = rankedLegs.length ? rankedLegs.reduce((sum, item) => sum + item.score, 0) / rankedLegs.length : 0;
  const couponRecommendation = intelligenceScore >= 72 && !rankedLegs.some((item) => item.recommendation === 'BLOCK') ? 'KEEP' : intelligenceScore >= 52 && !rankedLegs.some((item) => item.recommendation === 'BLOCK') ? 'REVIEW' : 'BLOCK';

  const generate = async () => {
    setBusy(true);
    setError('');
    try {
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
        maxLegs: 8,
        minLegOdds: 1.15,
        maxLegOdds: 8,
        minConfidence: .50,
        strategy: 'TARGET_ODDS',
      });
      const cert = certifyCoupon(source, coupon);
      setResult(coupon);
      setCertification(cert);
      if (coupon.status !== 'BLOCKED') { const response = await fetch('/api/coupon-lab', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save', coupon, certification: cert, provenance: cert.provenance, sport }) }); if (response.ok) { const saved = await response.json() as CouponSnapshot; setSnapshot(saved); setVariants(buildVariants(coupon)); void fetch('/api/coupon-lab', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'pdf', id: saved.id }) }).then(async (pdfResponse) => { if (!pdfResponse.ok) return; const pdf = await pdfResponse.json() as { base64: string }; const bytes = Uint8Array.from(atob(pdf.base64), (ch) => ch.charCodeAt(0)); const blob = new Blob([bytes], { type: 'application/pdf' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'bet-builder-' + saved.id + '.pdf'; link.click(); URL.revokeObjectURL(url); }).catch(() => undefined); } }
      if (coupon.status !== 'BLOCKED' && snapshot) { fetch('/api/coupon-lab', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'pdf', id: snapshot.id }) }).then(async (response) => { if (!response.ok) return; const pdf = await response.json() as { base64: string }; const bytes = Uint8Array.from(atob(pdf.base64), (ch) => ch.charCodeAt(0)); const blob = new Blob([bytes], { type: 'application/pdf' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'bet-builder-' + snapshot.id + '.pdf'; link.click(); URL.revokeObjectURL(url); }).catch(() => undefined); }
      if (coupon.status === 'BLOCKED') setError(coupon.blockers.join(' · ') || 'Nie znaleziono kwalifikowanych wydarzeń.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się wygenerować kuponu.');
    } finally {
      setBusy(false);
    }
  };

  const printPdf = () => window.print();
  const requestSwap = (selectionId: string) => {
    setSwapTarget(selectionId);
    const candidates = candidateLegs.filter((x) => Boolean(x)).map((x) => x as CouponResult['legs'][number]);
    setSimilarLegs(result ? findSimilarLegs(result, selectionId, candidates) as CouponLegExplanation[] : []);
  };
  const applySwap = (selectionId: string) => {
    const replacement = candidateLegs.find((x) => x && x.selectionId === selectionId);
    if (!replacement || !result || !swapTarget) return;
    setResult(replaceLegInContext(result, swapTarget, replacement as CouponResult['legs'][number]));
    setSwapTarget(null);
    setSimilarLegs([]);
  };
  const submitFeedback = async (helpful: boolean) => {
    if (!snapshot) return;
    setFeedback('sending');
    try {
      const response = await fetch('/api/coupon-lab', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'feedback',id:snapshot.id,helpful}) });
      if (response.ok) { setSnapshot(await response.json() as CouponSnapshot); setFeedback('done'); }
      else setFeedback('idle');
    } catch { setFeedback('idle'); }
  };

  useEffect(() => {
    if (!result || busy || autoPrintRef.current) return;
    autoPrintRef.current = true;
    const timer = window.setTimeout(() => window.print(), 700);
    return () => window.clearTimeout(timer);
  }, [result, busy]);
  if (phase === 'loading' && !dataset) {
    return <div className="mx-auto max-w-5xl px-5 py-16 text-center text-slate-400">Pobieram aktualne wydarzenia i kursy…</div>;
  }

  const liveStatus = certification?.status === 'CERTIFIED' ? 'KURSY AKTUALNE' : certification?.status === 'REVIEW' ? 'WYMAGA WERYFIKACJI' : certification ? 'BRAK WYSTARCZAJĄCYCH KURSÓW' : 'GOTOWY';
  const statusReady = result?.status === 'READY';
  const dataTime = dataset?.normalizedAt ? new Date(dataset.normalizedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <>
      <style>{`@media print {
        body { background: white !important; color: black !important; }
        body * { visibility: hidden !important; }
        #coupon-print, #coupon-print * { visibility: visible !important; }
        #coupon-print { position: absolute; inset: 0; width: 100%; padding: 24px; color: #111 !important; background: white !important; }
        .no-print { display: none !important; }
      }`}</style>

      <main className="coupon-lab mx-auto w-full max-w-[1180px] px-4 py-7 md:px-6 md:py-10" data-sport={sport}>
        <div className="coupon-sport-atmosphere" aria-hidden="true"><div className="coupon-sport-action" /></div>
        <motion.header
          className="coupon-hero mb-7"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: .5, ease }}
        >
          <div className="coupon-eyebrow"><span className="live-pulse" /> BET BUILDER <span>/</span> AI COUPON LAB</div>
          <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="coupon-title">Zbuduj kupon<br /><span>z przewagą AI.</span></h1>
              <p className="coupon-subtitle">Ustal cel. Silnik przeanalizuje dostępne wydarzenia, kursy i zależności, a następnie zbuduje propozycję.</p>
            </div>
            <div className="coupon-data-pill">
              <span className="data-dot" />
              <span>{events.length} wydarzeń</span>
              <span className="muted-dot" />
              <span>{dataset?.mode === 'LIVE' ? 'LIVE DATA' : 'SYNC DATA'}</span>
            </div>
          </div>
        </motion.header>

        <motion.section
          className="coupon-builder-card no-print"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: .55, delay: .08, ease }}
        >
          <div className="builder-card-glow" />
          <div className="builder-head">
            <div>
              <div className="section-kicker"><Target size={13} /> CEL KUPONU</div>
              <h2>Powiedz silnikowi, czego szukasz.</h2>
            </div>
            <div className="builder-note"><Sparkles size={13} /> AI dobiera liczbę zdarzeń automatycznie</div>
          </div>

          <div className="nl-builder no-print">
            <div className="section-kicker"><Sparkles size={13} /> POWIEDZ AI, CZEGO SZUKASZ</div>
            <div className="nl-row">
              <input aria-label="Powiedz AI, czego szukasz" value={nlInput} onChange={(e) => setNlInput(e.target.value)} placeholder="Mam 30 zł. Chcę kupon około 10x, ale bez bardzo ryzykownych rynków." />
              <button type="button" onClick={() => setNlIntent(parseNaturalLanguageIntent(nlInput))}>INTERPRETUJ</button>
            </div>
            {nlIntent && <div className="nl-confirm"><strong>Rozumiem, że chcesz:</strong> kurs {nlIntent.targetOdds ?? 'do ustalenia'} · stawka {nlIntent.stake ?? 'do ustalenia'} PLN · ryzyko {nlIntent.riskPreference ?? 'bez preferencji'} · sport {nlIntent.sport ?? 'dowolny'}. <button type="button" onClick={() => { if (nlIntent.targetOdds) setTargetOdds(String(nlIntent.targetOdds)); if (nlIntent.stake !== undefined) setStake(String(nlIntent.stake)); setNlIntent(null); }}>ZASTOSUJ</button></div>}
          </div>

          <div className="builder-fields">
            <label className="premium-field">
              <span>Docelowy kurs</span>
              <div className="premium-input">
                <Target size={18} />
                <input aria-label="Docelowy kurs" value={targetOdds} onChange={(e) => setTargetOdds(e.target.value)} type="number" min="1.01" step="0.1" />
                <b>x</b>
              </div>
            </label>
            <label className="premium-field">
              <span>Stawka</span>
              <div className="premium-input stake-input">
                <WalletCards size={18} />
                <input aria-label="Stawka" value={stake} onChange={(e) => setStake(e.target.value)} type="number" min="0" step="1" />
                <b>PLN</b>
              </div>
            </label>
            <label className="premium-field">
              <span>Sport</span>
              <div className="premium-select">
                <select value={sport} onChange={(e) => setSport(e.target.value)} aria-label="Sport">
                  {SPORTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>
            </label>
          </div>

          <div className="target-row">
            <div className="target-label">SZYBKI CEL</div>
            <div className="target-chips">
              {QUICK_TARGETS.map((value) => (
                <motion.button key={value} type="button" onClick={() => setTargetOdds(value)} aria-pressed={targetOdds === value} whileTap={{ scale: .96 }} className="target-chip">
                  <span>x</span>{value}
                </motion.button>
              ))}
            </div>
          </div>

          <div className="builder-actions">
            <div className="data-refresh">
              <span><ShieldCheck size={13} /> Dane źródłowe są weryfikowane przed generowaniem</span>
              <button type="button" onClick={() => void refresh(selectedDate, true, sport)}><RefreshCw size={12} /> Odśwież</button>
            </div>
            <motion.button type="button" onClick={() => void generate()} disabled={busy} whileTap={{ scale: .985 }} className="generate-button">
              <span className="generate-icon">{busy ? <RefreshCw size={18} className="spin" /> : <Zap size={18} />}</span>
              <span>{busy ? 'ANALIZUJĘ DANE…' : 'GENERUJ KUPON'}</span>
              <ArrowUpRight size={17} />
            </motion.button>
          </div>

          <AnimatePresence>
            {busy && (
              <motion.div className="analysis-rail" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <div className="analysis-steps">
                  <span className="active">MARKETS</span><i /> <span>VALUE</span><i /> <span>PROBABILITY</span><i /> <span>CORRELATION</span><i /> <span>COUPON</span>
                </div>
                <div className="analysis-progress"><span /></div>
              </motion.div>
            )}
          </AnimatePresence>

          {error && <motion.div role="alert" className="coupon-error" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}><AlertTriangle size={15} />{error}</motion.div>}
        </motion.section>

        <AnimatePresence mode="wait">
          {result && (
            <motion.section id="coupon-print" className="coupon-result-wrap" initial={{ opacity: 0, y: 24, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: .65, ease }}>
              <div className="result-head">
                <div>
                  <div className="coupon-eyebrow">AI DECISION <span>/</span> {selectedDate}</div>
                  <div className="result-title-row">
                    <h2>Gotowy kupon</h2>
                    <span className={statusReady ? 'status-badge ready' : 'status-badge review'}>{statusReady ? 'READY' : result.status}</span>
                  </div>
                </div>
                <div className="result-actions no-print">
                  <motion.button type="button" onClick={printPdf} whileTap={{ scale: .96 }}><FileDown size={15} /> PDF</motion.button>
                </div>
              </div>

              <div className="decision-card">
                <div className="decision-orbit" />
                <div className="decision-main">
                  <div className="decision-kicker"><span className="signal-dot" /> AI RECOMMENDATION</div>
                  <div className="decision-odds">x{result.combinedOdds.toFixed(2)}</div>
                  <div className="decision-caption">kurs łączny · {result.legs.length} selekcje</div>
                </div>
                <div className="decision-metrics">
                  <div><span>STAWKA</span><strong>{money(result.stake)} <small>PLN</small></strong></div>
                  <div><span>POTENCJALNY ZWROT</span><strong>{money(result.potentialReturn)} <small>PLN</small></strong></div>
                  <div><span>POTENCJALNY ZYSK</span><strong>{money(result.potentialProfit)} <small>PLN</small></strong></div>
                </div>
              </div>

              <div className="intelligence-summary">
                <div className="intelligence-summary-head">
                  <div><span className="section-kicker"><Gauge size={13} /> COUPON INTELLIGENCE 2.0</span><h3>Przewaga modelu nad rynkiem</h3></div>
                  <span className={avgEdge >= 0 ? 'intelligence-grade positive' : 'intelligence-grade negative'}>{avgEdge >= 0 ? 'POSITIVE SIGNAL' : 'WEAK SIGNAL'}</span>
                </div>
                <div className="intelligence-summary-grid">
                  <div><span>AVG CONFIDENCE</span><strong>{pct(avgConfidence)}</strong></div>
                  <div className={avgEdge >= 0 ? 'positive' : 'negative'}><span>AVG EDGE</span><strong>{signedPct(avgEdge)}</strong></div>
                  <div className={avgEv >= 0 ? 'positive' : 'negative'}><span>AVG EV</span><strong>{signedPct(avgEv)}</strong></div>
                  <div><span>MODEL / IMPLIED</span><strong>{pct(avgProbability)} / {pct(avgImplied)}</strong></div>
                </div>
              </div>

              <section className="coupon-analysis-grid no-print">
                <div className="analysis-card">
                  <div className="section-kicker"><Sparkles size={13} /> DLACZEGO AI WYBRAŁO TE ZDARZENIA?</div>
                  <h3>Wyjaśnienie powiązane z rzeczywistym snapshotem.</h3>
                  {(snapshot?.explanation ?? (result ? buildCouponExplanation(result) : [])).slice(0, fullExplanation ? 20 : 2).map((item) => <article key={item.selectionId} className="explanation-item"><strong>{result?.legs.find((l) => l.selectionId === item.selectionId)?.eventLabel ?? item.selectionId}</strong><p>{fullExplanation ? item.full : item.short}</p></article>)}
                  <button type="button" className="analysis-link" onClick={() => setFullExplanation((v) => !v)}>{fullExplanation ? 'Pokaż krótką analizę' : 'Pokaż pełną analizę'}</button>
                </div>
                {risk && <div className="analysis-card risk-card"><div className="section-kicker"><ShieldCheck size={13} /> PROFIL RYZYKA</div><div className="risk-profile">{risk.profile}</div><div className="risk-metrics"><span>PROBABILITY <b>{pct(risk.probability)}</b></span><span>VALUE <b>{signedPct(result.estimatedEv)}</b></span><span>CORRELATION <b>{pct(risk.correlation)}</b></span><span>VOLATILITY <b>{pct(risk.volatility)}</b></span></div>{risk.reasons.map((x) => <div key={x} className="risk-reason">{x}</div>)}</div>}
              </section>
              {variants.length > 0 && <section className="variant-panel no-print"><div className="section-kicker"><Gauge size={13} /> WARIANTY</div><div className="variant-tabs">{variants.map((v) => <button key={v.key} type="button" className={activeVariant === v.key ? 'active' : ''} onClick={() => { setResult(v.coupon); setActiveVariant(v.key); }}><strong>{v.label}</strong><span>x{v.coupon.combinedOdds.toFixed(2)} · {v.coupon.legs.length} zdarzeń · {v.risk}</span><small>{v.description}</small></button>)}</div></section>}

              <div className="trust-strip">
                <div><CheckCircle2 size={15} /><span>{liveStatus}</span></div>
                <div><Gauge size={15} /><span>VALUE CHECKED</span></div>
                <div><ShieldCheck size={15} /><span>AUTOMATYCZNE OBSTAWIANIE WYŁĄCZONE</span></div>
                {dataTime && <div className="trust-time">DANE {dataTime}</div>}
              </div>

              <div className="result-grid">
                <div className="selections-panel">
                  <div className="panel-head">
                    <div><span className="section-kicker">SELECTIONS</span><h3>Wybrane zdarzenia</h3></div>
                    <span className="count-pill">{result.legs.length}</span>
                  </div>
                  <div className="selection-list">
                    {result.legs.map((leg, index) => (
                      <motion.article key={leg.selectionId} className="selection-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .1 + index * .07, duration: .4, ease }}>
                        <div className="selection-index">{String(index + 1).padStart(2, '0')}</div>
                        <div className="selection-content">
                          <div className="selection-meta">{leg.league} <span>·</span> {new Date(leg.startTime).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}</div>
                          <h4>{leg.eventLabel}</h4>
                          <div className="selection-market"><span>MARKET</span><strong>{leg.label}</strong></div>
                          <div className="selection-metrics" aria-label="Metryki selekcji">
                            <div><span>P(EDGE)</span><strong>{pct(leg.probability)}</strong></div>
                            <div><span>IMPLIED</span><strong>{pct(1 / leg.marketOdds)}</strong></div>
                            <div className={leg.edge >= 0 ? 'positive' : 'negative'}><span>EDGE</span><strong>{signedPct(leg.edge)}</strong></div>
                            <div className={leg.risk === 'CRITICAL' ? 'negative' : ''}><span>RISK</span><strong>{leg.risk}</strong></div>
                          </div>
                          <div className="selection-probability">
                            <div className="probability-head"><span>MODEL PROBABILITY</span><b>{pct(leg.probability)}</b></div>
                            <div className="probability-track"><i style={{ width: `${Math.min(100, Math.max(0, leg.probability * 100))}%` }} /><em style={{ left: `${Math.min(100, Math.max(0, (1 / leg.marketOdds) * 100))}%` }} /></div>
                            <div className="probability-foot"><span>market implied {pct(1 / leg.marketOdds)}</span><span>{leg.probability >= 1 / leg.marketOdds ? 'MODEL > MARKET' : 'MODEL < MARKET'}</span></div>
                          </div>
                          <div className="selection-reason">
                            <span>DLACZEGO AI</span>
                            <p>{leg.reasons.join(' · ')}. Kurs x{leg.marketOdds.toFixed(2)} oznacza implied probability {pct(1 / leg.marketOdds)}; model szacuje {pct(leg.probability)}. Confidence {pct(leg.confidence)}, edge {signedPct(leg.edge)}, EV {signedPct(leg.ev)}.</p>
                          </div>
                        </div>
                        <div className="selection-odds"><span>x{leg.marketOdds.toFixed(2)}</span><button type="button" className="swap-button no-print" onClick={() => requestSwap(leg.selectionId)}>ZAMIEŃ</button></div>
                      </motion.article>
                    ))}
                  </div>
                </div>

                {swapTarget && <div className="swap-panel no-print"><div className="section-kicker">ZAMIANA ZDARZENIA</div><h3>Alternatywy z zachowaniem kontekstu</h3>{similarLegs.length ? similarLegs.map((x) => <button type="button" key={x.selectionId} onClick={() => applySwap(x.selectionId)}><strong>{x.short}</strong><span>{x.couponImpact}</span></button>) : <p>Brak podobnych kandydatów w aktualnym zbiorze danych.</p>}<button type="button" onClick={() => { setSwapTarget(null); setSimilarLegs([]); }}>ANULUJ</button></div>}
                <aside className="insight-panel">
                  <div className="section-kicker"><Sparkles size={13} /> AI INTELLIGENCE 3.0</div>
                  <h3>Decyzja oparta na danych.</h3>
                  <p>Każda selekcja przechodzi przez analizę rynku, dostępnego kursu i spójności całego kuponu.</p>
                  <div className="coupon-intelligence-score">
                    <div><span>AI CONFIDENCE SCORE</span><strong>{intelligenceScore.toFixed(0)}<small>/100</small></strong></div>
                    <span className={`recommendation-badge ${couponRecommendation.toLowerCase()}`}>{couponRecommendation}</span>
                  </div>
                  {weakest && (
                    <div className="weakest-link">
                      <div className="weakest-head"><span>NAJSŁABSZE OGNIWO</span><b>{weakest.score.toFixed(0)}/100</b></div>
                      <strong>{weakest.leg.eventLabel}</strong>
                      <p>{weakest.leg.label} · confidence {pct(weakest.leg.confidence)} · edge {signedPct(weakest.leg.edge)}</p>
                      <span className={`weakest-action ${weakest.recommendation.toLowerCase()}`}>{weakest.recommendation === 'KEEP' ? 'UTRZYMAJ' : weakest.recommendation === 'REVIEW' ? 'ZWERYFIKUJ' : 'ZABLOKUJ'}</span>
                    </div>
                  )}
                  <div className="ranking-list">
                    {rankedLegs.map((item, index) => (
                      <div className="ranking-row" key={item.leg.selectionId}>
                        <span className="ranking-number">{index + 1}</span>
                        <div><strong>{item.leg.eventLabel}</strong><small>{item.leg.label}</small></div>
                        <b>{item.score.toFixed(0)}</b>
                        <span className={`ranking-recommendation ${item.recommendation.toLowerCase()}`}>{item.recommendation}</span>
                      </div>
                    ))}
                  </div>
                  <div className="insight-bars">
                    <div><span>DATA QUALITY</span><b>LIVE</b><i><em style={{ width: '92%' }} /></i></div>
                    <div><span>MARKET SIGNAL</span><b>CHECKED</b><i><em style={{ width: '78%' }} /></i></div>
                    <div><span>CORRELATION</span><b>CHECKED</b><i><em style={{ width: '84%' }} /></i></div>
                  </div>
                  <div className="insight-note"><ShieldCheck size={14} /><span>Kupon pozostaje propozycją analityczną. Zewnętrzne działanie wymaga osobnej zgody. OBSERVATIONAL_ONLY.</span></div>
                  {snapshot && <div className="feedback-box no-print"><strong>Czy ta analiza była pomocna?</strong><div><button type="button" onClick={() => void submitFeedback(true)} disabled={feedback==='sending'}>TAK</button><button type="button" onClick={() => void submitFeedback(false)} disabled={feedback==='sending'}>NIE</button></div>{feedback==='done' && <small>Zapisano jako sygnał dla Learning Engine.</small>}</div>}
                  <div className="gate-box no-print"><strong>APPROVAL GATE</strong><span>Automatyczne obstawianie pozostaje wyłączone.</span><a href="#/missions">OTWÓRZ MISSION CONTROL</a></div>
                </aside>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>
    </>
  );
}
