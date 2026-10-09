import {useMemo,useState} from 'react';
import {BrainCircuit,ChevronRight,Clock3,GitCompareArrows,RefreshCw,ShieldCheck,Target,Trophy,Workflow} from 'lucide-react';
import {useIntelligence} from '../state/IntelligenceProvider';
import {liveEvents} from '../services/liveAdapter';
import {enrichPrediction,predictSelection} from '../core/predictionEngine';
import {explainPrediction,buildModelTournament,type DecisionReplay} from '../core/predictionIntelligence';
import {BrowserPredictionReplayRepository} from '../core/predictionReplayStore';
import {Panel,SectionHeading,Chip,Stat,Meter,Button,EmptyState} from '../components/ui';
import {cx} from '../lib/format';
import {buildCockpitTrustLayer,trustLayerEvidenceScore,trustLayerSampleLabel} from '../core/cockpitTrustLayerM166M180';

function pct(v:number){return (v*100).toFixed(0)+'%';}
function stageTone(stage:string,current:string){const i=['DATA SNAPSHOT','MODEL ANALYSIS','PREDICTION CREATED','FINAL DECISION','OUTCOME','GRADING','LEARNING'].indexOf(stage);const c=['DATA SNAPSHOT','MODEL ANALYSIS','PREDICTION CREATED','FINAL DECISION','OUTCOME','GRADING','LEARNING'].indexOf(current);return i<c?'text-positive':i===c?'text-ai border-ai/35 bg-ai/10':'text-faint';}

export default function PredictionIntelligencePage(){
 const {dataset,analyses,runAnalysis,refresh,phase}=useIntelligence();
 const predictions=useMemo(()=>dataset?liveEvents(dataset).flatMap(e=>e.markets.flatMap(m=>m.selections.map(predictSelection))).filter(p=>p.ev>0).sort((a,b)=>b.ev-a.ev):[],[dataset]);
 const [selectedId,setSelectedId]=useState('');
 const replayRepo=useMemo(()=>new BrowserPredictionReplayRepository(),[]);
 const [replay,setReplay]=useState<DecisionReplay|null>(()=>null);
 const selected=predictions.find(p=>p.selectionId===selectedId)??predictions[0]??null;
 const tournament=useMemo(()=>buildModelTournament(analyses.flatMap(r=>{if(!r.outcome)return [];const estimate=r.analysis.probabilityEstimates[0]?.modelProbability.value??0.5;const value=r.analysis.valueSignals[0];const odds=value?.bestPrice.value??2;return [{id:r.id,createdAt:r.analysis.generatedAt,eventId:r.eventId,selection:value?.selectionId??r.eventId,probability:estimate,odds,modelVersion:r.analysis.meta.modelVersion,outcome:r.outcome?.outcome===1?'WON':'LOST' as const}];}),20),[analyses]);
 const settledSample=tournament.reduce((s,x)=>s+x.settled,0);
 const intelligence=selected?enrichPrediction(selected,{sampleSize:settledSample,evidenceQuality:1,dataFreshness:1}):null;
 const explanation=selected?explainPrediction(selected):null;
 const inspect=async()=>{if(!selected)return;setReplay(replayRepo.snapshot(selected));await runAnalysis(selected.eventId,{depth:'deep'});};
 const eventLabel=selected&&dataset?liveEvents(dataset).find(e=>e.id===selected.eventId):null;
 const storedReplays=replayRepo.list();
 return <div className="space-y-5">
  <div className="bb-cockpit-hero rounded-2xl border border-ai/20 bg-gradient-to-br from-ai/[.10] via-surface to-market/[.04] p-5 md:p-7">
   <div className="flex flex-wrap items-start justify-between gap-4">
    <div><div className="mb-2 flex items-center gap-2 text-[9px] font-mono font-bold uppercase tracking-[.18em] text-ai"><BrainCircuit size={13}/>Prediction Intelligence Cockpit</div>
    <h1 className="text-3xl font-bold md:text-5xl">Nie tylko typ. <span className="text-ai">Dowód decyzji.</span></h1>
    <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">Core Engine pokazuje co widział, co przewidział, jakie były argumenty przeciwne i co stało się później. Każda decyzja jest traktowana jako audytowalny snapshot.</p></div>
    <div className="flex gap-2"><Button variant="ghost" icon={<RefreshCw size={13}/>} onClick={()=>void refresh()} loading={phase==='loading'}>Odśwież dane</Button><Chip tone="ai"><ShieldCheck size={11}/> OBSERVATIONAL_ONLY</Chip></div>
   </div>
   <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <Stat label="Predictions available" value={predictions.length} hint="qualified positive-EV selections" tone="ai"/>
    <Stat label="Selected model" value={selected?.modelVersion??'—'} hint="versioned decision source"/>
    <Stat label="Data mode" value={dataset?.mode??'—'} hint="canonical intelligence dataset" tone="market"/>
    <Stat label="Settled sample" value={tournament.reduce((s,x)=>s+x.settled,0)} hint="only settled outcomes count"/>
   </div>
  </div>

  {selected&&intelligence?<TrustLayerCard layer={buildCockpitTrustLayer(selected,intelligence,settledSample)} sampleSize={settledSample}/>:null}

  <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
   <Panel className="p-5">
    <SectionHeading index="01" title="Decision candidates" subtitle="Wybierz predykcję do pełnego Decision Replay." icon={<Target size={16} className="text-ai"/>}/>
    {predictions.length===0?<EmptyState title="Brak kwalifikowanych predykcji" detail="Odśwież dane lub poczekaj na nowe rynki."/>:<div className="space-y-2">
      {predictions.slice(0,12).map(p=><button key={p.selectionId} type="button" onClick={()=>setSelectedId(p.selectionId)} className={cx('w-full rounded-xl border p-3 text-left transition',selected?.selectionId===p.selectionId?'border-ai/45 bg-ai/[.08]':'border-line bg-surface-2 hover:border-ai/25')}>
       <div className="flex items-center justify-between gap-3"><div className="min-w-0"><b className="block truncate text-sm">{p.label}</b><span className="block truncate text-[10px] text-faint">{p.eventId} · {p.marketId}</span></div><span className="font-mono text-market">{p.marketOdds.toFixed(2)}</span></div>
       <div className="mt-2 grid grid-cols-3 gap-2 text-[9px] font-mono"><span className="text-ai">P {pct(p.probability)}</span><span className="text-positive">EV {(p.ev*100).toFixed(1)}%</span><span className="text-muted">C {pct(p.confidence)}</span></div>
      </button>)}
    </div>}
   </Panel>

   <Panel tone="ai" className="p-5">
    <SectionHeading index="02" title="Why AI thinks so" subtitle="Argumenty wspierające, neutralne i przeciwne — bez narracji o pewnej wygranej." icon={<BrainCircuit size={16} className="text-ai"/>}/>
    {selected&&explanation?<div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4"><Stat label="Probability" value={pct(intelligence?.ensembleProbability??selected.probability)} tone="ai"/><Stat label="Market implied" value={pct(1/selected.marketOdds)} tone="market"/><Stat label="Edge" value={(intelligence?.edgePct??selected.edge*100).toFixed(1)+'%'} tone={(intelligence?.edgePct??selected.edge*100)>0?'positive':'negative'}/><Stat label="Confidence" value={pct(intelligence?.confidenceScore??selected.confidence)} /></div>
      <div className="rounded-xl border border-ai/20 bg-ai/[.06] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><b>{explanation.headline}</b><Chip tone={selected.risk==='LOW'?'positive':selected.risk==='MEDIUM'?'warn':'negative'}>{selected.risk} RISK</Chip></div><div className="mt-3"><Meter value={selected.confidence} label="confidence"/></div></div>
      <div className="grid gap-3 md:grid-cols-3">
       <Factor title="SUPPORTING" tone="positive" items={explanation.supporting}/>
       <Factor title="NEUTRAL" tone="neutral" items={explanation.neutral}/>
       <Factor title="CONTRA" tone="negative" items={explanation.opposing}/>
      </div>
      <div className="flex flex-wrap gap-2"><Button icon={<Workflow size={13}/>} onClick={inspect} loading={!!selected&&phase==='loading'}>Zapisz Decision Replay</Button><Chip tone={replay?'positive':'neutral'}>{storedReplays.length} SNAPSHOTS</Chip>{eventLabel?<span className="self-center text-[10px] text-faint">{eventLabel.homeTeam} vs {eventLabel.awayTeam}</span>:null}</div>
    </div>:<EmptyState title="Wybierz prediction" detail="Cockpit wygeneruje pełne wyjaśnienie dopiero dla konkretnej decyzji."/>}
   </Panel>
  </div>

  {replay?<Panel className="p-5">
   <SectionHeading index="03" title="AI Decision Replay" subtitle="Immutable-style snapshot decyzji. Outcome pozostaje PENDING, dopóki rzeczywisty rezultat nie zostanie rozliczony." icon={<Clock3 size={16} className="text-market"/>}/>
   <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
    <div className="grid gap-2 md:grid-cols-7">{replay.stages.map((stage,i)=><div key={stage} className={cx('rounded-lg border p-3',stageTone(stage,replay.outcome==='PENDING'?'PREDICTION CREATED':'LEARNING'))}><span className="font-mono text-[9px]">{String(i+1).padStart(2,'0')}</span><b className="mt-2 block text-[10px]">{stage}</b><span className="mt-1 block text-[9px] text-faint">{i<4?'captured':'awaiting verified outcome'}</span></div>)}</div>
    <div className="min-w-[180px] rounded-xl border border-line bg-surface-2 p-4"><div className="text-[9px] uppercase tracking-widest text-faint">Snapshot</div><div className="mt-2 font-mono text-xs text-ai">{replay.predictionId}</div><div className="mt-3 space-y-2 text-[10px]"><div className="flex justify-between"><span>Model</span><b>{replay.modelVersion}</b></div><div className="flex justify-between"><span>Outcome</span><Chip tone="warn">{replay.outcome}</Chip></div><div className="flex justify-between"><span>Captured</span><b>{new Date(replay.capturedAt).toLocaleString('pl-PL')}</b></div></div></div>
   </div>
  </Panel>:null}

  <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
   <Panel className="p-5">
    <SectionHeading index="04" title="AI Prediction Tournament" subtitle="Modele są rankowane dopiero po odpowiedniej liczbie rozliczonych predykcji." icon={<Trophy size={16} className="text-market"/>}/>
    {tournament.length===0?<EmptyState title="Brak rozliczonego track recordu" detail="System celowo nie tworzy sztucznego rankingu. Ranking zacznie działać po zebraniu minimum 20 settled predictions dla modelu." icon={<Trophy size={22}/>}/>:<div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead><tr className="text-[9px] uppercase tracking-widest text-faint"><th className="py-2">Rank</th><th>Model</th><th>Sample</th><th>Hit rate</th><th>Brier</th><th>ROI</th><th>Calibration</th></tr></thead><tbody>{tournament.map(x=><tr key={x.modelVersion} className="border-t border-line-soft"><td className="py-3 font-mono text-market">{x.rank??'—'}</td><td className="font-mono text-ai">{x.modelVersion}</td><td>{x.settled}/{x.sampleSize}{!x.eligible&&<span className="ml-2 text-[9px] text-faint">INSUFFICIENT SAMPLE</span>}</td><td>{pct(x.hitRate)}</td><td>{x.brierScore.toFixed(3)}</td><td className={x.simulatedRoi>=0?'text-positive':'text-negative'}>{(x.simulatedRoi*100).toFixed(1)}%</td><td>{pct(x.calibration)}</td></tr>)}</tbody></table></div>}
   </Panel>
   <Panel className="p-5">
    <SectionHeading index="05" title="Closed learning loop" subtitle="Outcome nie kończy decyzji. Trafia z powrotem do Learning Engine." icon={<GitCompareArrows size={16} className="text-positive"/>}/>
    <div className="space-y-2">{['DATA SNAPSHOT','PREDICTION','TIMESTAMP','OUTCOME','GRADING','LEARNING','NEXT MODEL VERSION'].map((x,i)=><div key={x} className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 p-3"><span className="grid h-6 w-6 place-items-center rounded-full bg-ai/10 font-mono text-[9px] text-ai">{i+1}</span><div><b className="block text-[10px]">{x}</b><span className="text-[9px] text-faint">{i<3?'immutable decision evidence':i<6?'measured outcome feedback':'versioned model evolution'}</span></div>{i<6?<ChevronRight size={12} className="ml-auto text-faint"/>:null}</div>)}</div>
   </Panel>
  </div>
 </div>;
}
function TrustLayerCard({layer,sampleSize}:{layer:ReturnType<typeof buildCockpitTrustLayer>;sampleSize:number}) {
 const d=layer.decision;
 return <Panel tone="ai" className="p-5">
  <SectionHeading index="TRUST" title="Decision Trust Layer" subtitle="Jedna warstwa nad kanonicznym Prediction Engine: dowód, nie obietnica wyniku." icon={<ShieldCheck size={16} className="text-ai"/>}/>
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
   <Stat label="State" value={d.state} hint="policy/data state"/>
   <Stat label="Evidence" value={trustLayerEvidenceScore(layer).toFixed(2)} hint="weighted evidence quality"/>
   <Stat label="Uncertainty" value={layer.decision.confidence.toFixed(2)} hint={layer.uncertainty}/>
   <Stat label="Sample" value={trustLayerSampleLabel(sampleSize)} hint="ranking never promoted from thin data"/>
   <Stat label="Risk" value={d.risk} tone={d.risk==='LOW'?'positive':d.risk==='CRITICAL'?'negative':'default'}/>
  </div>
  <div className="mt-4 grid gap-3 md:grid-cols-3">
   <div className="rounded-xl border border-line bg-surface-2 p-3"><div className="text-[9px] uppercase tracking-widest text-faint">Decision evidence</div><div className="mt-2 space-y-2">{d.evidence.map(e=><div key={e.id} className="flex justify-between gap-3 text-[10px]"><span className="text-muted">{e.label}</span><b>{e.value}</b></div>)}</div></div>
   <div className="rounded-xl border border-line bg-surface-2 p-3"><div className="text-[9px] uppercase tracking-widest text-faint">Responsible friction</div><b className="mt-2 block text-sm">{layer.friction}</b><span className="text-[9px] text-faint">Human approval is always required before execution.</span></div>
   <div className="rounded-xl border border-line bg-surface-2 p-3"><div className="text-[9px] uppercase tracking-widest text-faint">Execution boundary</div><b className="mt-2 block text-positive">HUMAN APPROVAL</b><span className="text-[9px] text-faint">executionAllowed = false</span></div>
  </div>
 </Panel>;
}

function Factor({title,tone,items}:{title:string;tone:'positive'|'neutral'|'negative';items:string[]}){
 const c=tone==='positive'?'text-positive border-positive/20 bg-positive/[.04]':tone==='negative'?'text-negative border-negative/20 bg-negative/[.04]':'text-muted border-line bg-surface-2';
 return <div className={cx('rounded-xl border p-3',c)}><div className="font-mono text-[9px] font-bold tracking-widest">{title}</div><ul className="mt-2 space-y-2">{(items.length?items:['No additional signal']).map(x=><li key={x} className="text-[10px] leading-5 text-foreground/80">• {x}</li>)}</ul></div>;
}
