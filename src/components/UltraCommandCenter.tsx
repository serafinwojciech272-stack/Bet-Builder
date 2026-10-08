import { useMemo, useState } from 'react';
import { ArrowRight, BrainCircuit, ChevronDown, Crosshair, Gauge, Layers3, LockKeyhole, Sparkles, Target, Zap } from 'lucide-react';

type Risk = 'SAFE' | 'BALANCED' | 'VALUE' | 'HIGH';

interface Props {
  stake: number;
  selectionsCount: number;
  combinedOdds: number;
  onStakeChange: (value: number) => void;
  onBuild: (settings: { intent: string; risk: Risk; legs: number; targetOdds: number }) => void;
  onOpenMarkets: () => void;
}

const profiles: Array<{ key: Risk; label: string; desc: string }> = [
  { key: 'SAFE', label: 'Safe', desc: 'jakość + niższa ekspozycja' },
  { key: 'BALANCED', label: 'Balanced', desc: 'równowaga value i confidence' },
  { key: 'VALUE', label: 'Value', desc: 'większy nacisk na edge' },
  { key: 'HIGH', label: 'High Risk', desc: 'wysoki kurs, większa zmienność' },
];

export function UltraCommandCenter({ stake, selectionsCount, combinedOdds, onStakeChange, onBuild, onOpenMarkets }: Props) {
  const [intent, setIntent] = useState('');
  const [risk, setRisk] = useState<Risk>('BALANCED');
  const [legs, setLegs] = useState(5);
  const [targetOdds, setTargetOdds] = useState(6);
  const [advanced, setAdvanced] = useState(false);

  const potentialReturn = useMemo(() => Math.max(0, stake * combinedOdds), [stake, combinedOdds]);

  const quickIntent = (value: string, nextRisk: Risk) => {
    setIntent(value);
    setRisk(nextRisk);
  };

  return (
    <section className="ultra-command" aria-label="Ultra Bet Builder command center">
      <div className="ultra-command-noise" aria-hidden />
      <div className="ultra-command-grid" aria-hidden />
      <div className="ultra-command-content">
        <div className="ultra-command-top">
          <div>
            <div className="ultra-kicker"><span className="ultra-live-pulse" /> ULTRA BET BUILDER · SPORTS DECISION LAB</div>
            <h2>Build your <span>edge.</span></h2>
            <p>Powiedz, czego szukasz. System przeszuka dostępne rynki, zbuduje kandydatów i przeprowadzi ich przez analizę oraz deterministyczne gates.</p>
          </div>
          <div className="ultra-live-state"><Zap size={13} /> MARKET PULSE <b>LIVE</b></div>
        </div>

        <div className="ultra-intent-wrap">
          <div className="ultra-intent-label"><Sparkles size={13} /> YOUR INTENT</div>
          <textarea
            value={intent}
            onChange={e => setIntent(e.target.value)}
            rows={3}
            placeholder="Mam 100 zł. Zbuduj mi kupon na dzisiaj, 4-5 zdarzeń, raczej bezpieczny, kurs około 5-8."
            aria-label="Describe the coupon you want"
          />
          <div className="ultra-intent-footer">
            <span>Natural language → controlled decision pipeline</span>
            <span className="ultra-proof"><LockKeyhole size={11} /> AI nie omija deterministic gates</span>
          </div>
        </div>

        <div className="ultra-quick-row">
          <span>QUICK BUILD</span>
          <button type="button" onClick={() => quickIntent('Najlepszy kupon na dziś, z naciskiem na jakość danych.', 'BALANCED')}>Best Today</button>
          <button type="button" onClick={() => quickIntent('Chcę możliwie bezpieczny kupon na dziś.', 'SAFE')}>Safe</button>
          <button type="button" onClick={() => quickIntent('Szukaj najlepszego value przy umiarkowanym ryzyku.', 'VALUE')}>Value</button>
          <button type="button" onClick={() => quickIntent('Chcę wysoki kurs, ale pokaż mi dokładnie ryzyko.', 'HIGH')}>High Odds</button>
        </div>

        <div className="ultra-control-deck">
          <div className="ultra-control">
            <label><Target size={13} /> BUDGET</label>
            <div className="ultra-number">
              <input type="number" min={1} step={5} value={stake} onChange={e => onStakeChange(Math.max(1, Number(e.target.value) || 1))} aria-label="Budget" />
              <span>PLN</span>
            </div>
            <div className="ultra-pills">
              {[50, 100, 200, 500].map(v => <button type="button" key={v} className={stake === v ? 'active' : ''} onClick={() => onStakeChange(v)}>{v}</button>)}
          </div>
          </div>

          <div className="ultra-control">
            <label><Layers3 size={13} /> SELECTIONS</label>
            <div className="ultra-pills ultra-large">{[3, 4, 5, 6].map(v => <button type="button" key={v} className={legs === v ? 'active' : ''} onClick={() => setLegs(v)}>{v}</button>)}</div>
            <small>Cel: {targetOdds.toFixed(1)}× combined odds</small>
          </div>

          <div className="ultra-control ultra-risk-control">
            <label><Gauge size={13} /> RISK PROFILE</label>
            <div className="ultra-profile-grid">
              {profiles.map(p => <button type="button" key={p.key} className={risk === p.key ? 'active' : ''} onClick={() => setRisk(p.key)}><b>{p.label}</b><span>{p.desc}</span></button>)}
            </div>
          </div>

          <div className="ultra-control">
            <label><Crosshair size={13} /> TARGET ODDS</label>
            <div className="ultra-target"><input type="range" min={2} max={25} step={1} value={targetOdds} onChange={e => setTargetOdds(Number(e.target.value))} /><strong>{targetOdds}×</strong></div>
            <small>System traktuje kurs jako cel, nie gwarancję.</small>
          </div>
        </div>

        <div className="ultra-action-row">
          <button type="button" className="ultra-primary" onClick={() => onBuild({ intent, risk, legs, targetOdds })}><BrainCircuit size={18} /> BUILD MY COUPON <ArrowRight size={17} /></button>
          <button type="button" className="ultra-secondary" onClick={onOpenMarkets}>EXPLORE MARKETS</button>
          <button type="button" className="ultra-advanced-toggle" onClick={() => setAdvanced(v => !v)}><ChevronDown size={14} className={advanced ? 'rotated' : ''} /> Advanced controls</button>
        </div>

        {advanced && <div className="ultra-advanced">
          <div><b>Current ticket</b><span>{selectionsCount} selections</span></div>
          <div><b>Combined odds</b><span>{combinedOdds.toFixed(2)}×</span></div>
          <div><b>Potential return</b><span>{potentialReturn.toFixed(2)} PLN</span></div>
          <div><b>Decision mode</b><span>OBSERVATIONAL · HUMAN APPROVAL</span></div>
        </div>}
      </div>
    </section>
  );
}
