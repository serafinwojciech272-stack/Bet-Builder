import { BrainCircuit, ChevronRight, Cpu, DatabaseZap, LockKeyhole, Sparkles } from 'lucide-react';
import { useIntelligence } from '../state/IntelligenceProvider';

export function AICommandCenter() {
  const { engine, dataset, analyses, missions } = useIntelligence();
  const live = dataset?.events.filter((e) => e.status === 'live').length ?? 0;
  const coverage = dataset ? Math.min(100, Math.round((dataset.snapshots.length / Math.max(dataset.events.length, 1)) * 10)) : 0;
  const signals = [
    { icon: DatabaseZap, label: 'MARKET FABRIC', value: dataset?.mode ?? 'SYNC', tone: dataset?.mode === 'LIVE' ? 'positive' : 'warn' },
    { icon: BrainCircuit, label: 'AI ANALYSIS', value: engine?.aiOnline ? 'ONLINE' : 'STANDBY', tone: engine?.aiOnline ? 'ai' : 'muted' },
    { icon: Cpu, label: 'CORE ENGINE', value: engine?.coreVersion ?? 'BOOT', tone: engine ? 'positive' : 'muted' },
    { icon: LockKeyhole, label: 'EXECUTION', value: 'GOVERNED', tone: 'mission' },
  ];
  return <section className="bb-ai-command" aria-label="AI Command Center">
    <div className="bb-ai-command-noise" aria-hidden />
    <div className="bb-ai-command-head">
      <div><div className="bb-eyebrow"><Sparkles size={11}/> AI COMMAND CENTER · MULTI-LAYER INTELLIGENCE</div><h2>Nie pokazujemy AI. <span>Pokazujemy jego decyzję.</span></h2><p>Live data → deterministic models → AI reasoning → governed action. Każdy krok ma własny stan, źródło i bramkę.</p></div>
      <div className="bb-ai-orbit" aria-hidden><span /><span /><span /><b>AI</b></div>
    </div>
    <div className="bb-ai-grid">
      {signals.map(({icon:Icon,label,value,tone}) => <div key={label} className={`bb-ai-signal tone-${tone}`}><Icon size={15}/><small>{label}</small><strong>{value}</strong><i /></div>)}
    </div>
    <div className="bb-ai-bottom">
      <div className="bb-ai-metric"><span>LIVE EVENTS</span><strong>{live}</strong><small>real-time surface</small></div>
      <div className="bb-ai-metric"><span>SNAPSHOT COVERAGE</span><strong>{coverage}%</strong><small>normalized market fabric</small></div>
      <div className="bb-ai-metric"><span>ANALYSES</span><strong>{analyses.length}</strong><small>AI decision packets</small></div>
      <div className="bb-ai-metric"><span>MISSIONS</span><strong>{missions.length}</strong><small>governed workflows</small></div>
      <div className="bb-ai-cta">DECISION READY <ChevronRight size={14}/></div>
    </div>
  </section>;
}