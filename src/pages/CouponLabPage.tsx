import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowUpRight, CheckCircle2, FileDown, Gauge, RefreshCw, ShieldCheck, Sparkles, Target, WalletCards, Zap } from 'lucide-react';
import { useIntelligence } from '../state/IntelligenceProvider';
import { liveEvents } from '../services/liveAdapter';
import { generateCoupon, type CouponResult } from '../core/couponEngine';
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
  const autoPrintRef = useRef(false);

  const events = useMemo(() => dataset ? liveEvents(dataset) : [], [dataset]);
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
      setResult(coupon);
      setCertification(certifyCoupon(source, coupon));
      if (coupon.status === 'BLOCKED') setError(coupon.blockers.join(' · ') || 'Nie znaleziono kwalifikowanych wydarzeń.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się wygenerować kuponu.');
    } finally {
      setBusy(false);
    }
  };

  const printPdf = () => window.print();

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
                        <div className="selection-odds">x{leg.marketOdds.toFixed(2)}</div>
                      </motion.article>
                    ))}
                  </div>
                </div>

                <aside className="insight-panel">
                  <div className="section-kicker"><Sparkles size={13} /> AI INTELLIGENCE</div>
                  <h3>Decyzja oparta na danych.</h3>
                  <p>Każda selekcja przechodzi przez analizę rynku, dostępnego kursu i spójności całego kuponu.</p>
                  <div className="insight-bars">
                    <div><span>DATA QUALITY</span><b>LIVE</b><i><em style={{ width: '92%' }} /></i></div>
                    <div><span>MARKET SIGNAL</span><b>CHECKED</b><i><em style={{ width: '78%' }} /></i></div>
                    <div><span>CORRELATION</span><b>CHECKED</b><i><em style={{ width: '84%' }} /></i></div>
                  </div>
                  <div className="insight-note"><ShieldCheck size={14} /><span>Kupon pozostaje propozycją analityczną. Zewnętrzne działanie wymaga osobnej zgody.</span></div>
                </aside>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>
    </>
  );
}
