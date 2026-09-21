import { BrainCircuit, CheckCircle2, CircleAlert, GitBranch, Gauge, ShieldCheck, Sparkles } from 'lucide-react';
import type { DecisionCenterResult } from '../core/decisionCenter';
import type { OptimizationResult } from '../core/types';

type Props = { result: DecisionCenterResult; optimization: OptimizationResult | null };

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
const tone = (status: DecisionCenterResult['status']) => status === 'READY' ? 'ready' : status === 'CAUTION' ? 'caution' : 'blocked';

export function DecisionCockpit({ result, optimization }: Props) {
  const t = tone(result.status);
  const layers = [
    ['01', 'MARKET', result.marketQuality.grade, result.marketQuality.score],
    ['02', 'MODEL', pct(result.confidence), result.confidence],
    ['03', 'CORRELATION', pct(1 - result.correlationRisk), 1 - result.correlationRisk],
    ['04', 'PORTFOLIO', optimization ? 'OPTIMIZED' : 'PENDING', optimization ? optimization.diversificationScore : result.quality],
    ['05', 'CONTROL', result.status, result.status === 'READY' ? 1 : result.status === 'CAUTION' ? .62 : .15],
  ] as const;
  return <section className={`bb-decision-cockpit tone-${t}`} aria-label="AI Decision Cockpit">
    <div className="bb-cockpit-head">
      <div><div className="bb-eyebrow"><BrainCircuit size={11}/> DECISION COCKPIT · EVIDENCE GRAPH</div><h2>Od sygnału do decyzji — <span>z pełnym śladem.</span></h2><p>Quant, market structure, correlation, portfolio optimization i control plane są widoczne w jednym pakiecie decyzyjnym.</p></div>
      <div className="bb-cockpit-verdict"><small>VERDICT</small><strong>{result.status}</strong><span>{result.ev >= 0 ? '+' : ''}{(result.ev * 100).toFixed(1)}% model EV</span></div>
    </div>
    <div className="bb-cockpit-layers">
      {layers.map(([n,label,value,score],i)=><div className="bb-cockpit-layer" key={label}><span>{n}</span><div><small>{label}</small><strong>{value}</strong></div><div className="bb-cockpit-bar"><i style={{width:`${Math.max(5,Math.min(100,score*100))}%`}} /></div>{i<layers.length-1?<b>→</b>:null}</div>)}
    </div>
    <div className="bb-cockpit-bottom">
      <div><Gauge size={14}/><span>QUALITY</span><strong>{pct(result.quality)}</strong></div>
      <div><GitBranch size={14}/><span>DEPENDENCY</span><strong>{result.dependencyMultiplier.toFixed(3)}×</strong></div>
      <div><Sparkles size={14}/><span>ADJUSTED PROB.</span><strong>{pct(result.adjustedProbability)}</strong></div>
      <div><ShieldCheck size={14}/><span>GATE</span><strong>{result.blockers.length ? 'BLOCKED' : result.warnings.length ? 'REVIEW' : 'CLEAR'}</strong></div>
    </div>
    {(result.blockers.length || result.warnings.length) ? <div className="bb-cockpit-alerts">{result.blockers.slice(0,2).map(x=><div key={x}><CircleAlert size={13}/>{x}</div>)}{result.warnings.slice(0,2).map(x=><div key={x}><CircleAlert size={13}/>{x}</div>)}</div> : <div className="bb-cockpit-clear"><CheckCircle2 size={14}/> Evidence chain is internally consistent. Human approval remains required before execution.</div>}
  </section>;
}