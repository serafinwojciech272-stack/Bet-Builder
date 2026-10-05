import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, BarChart3, Search, Zap } from 'lucide-react';
import { useIntelligence } from '../state/IntelligenceProvider';
import { buildEventIntel } from '../state/selectors';
import { canonicalSportKey, SPORT_LABELS } from '../domain/feed/normalization';
import type { Selection, SportKey } from '../domain/types';
import { LoadingState, ErrorState } from '../components/ui';

const pct=(v:number)=>Math.round(v*100)+'%';
const edge=(v:number)=> (v>=0?'+':'')+v.toFixed(1)+'%';
const riskClass=(r:string)=>r==='LOW'?'text-[#5ee6a5]':r==='HIGH'?'text-[#ff6675]':'text-[#f5b95c]';

function Telemetry({dataset,count}:{dataset:ReturnType<typeof useIntelligence>['dataset'];count:number}){
 const live=dataset?.events.filter(e=>e.status==='live').length??0;
 return <div className="bb-telemetry" aria-label="Live intelligence telemetry">
  <div><small>Feed</small><strong>{dataset?.mode==='LIVE'?'LIVE':dataset?.mode==='DEMO'?'DEMO MODE':'SYNCING'}</strong></div>
  <div><small>Events</small><strong>{count}</strong></div>
  <div><small>Markets</small><strong>{dataset?.snapshots.length??'N/A'}</strong></div>
  <div><small>Live</small><strong>{live}</strong></div>
  <div><small>Core Engine</small><strong>{dataset?'READY':'N/A'}</strong></div>
  <div><small>Execution</small><strong>GATED</strong></div>
 </div>;
}

function EventCard({intel,onAdd}:{intel:ReturnType<typeof buildEventIntel>[number];onAdd:(s:Selection)=>void}){
 const {event,quality,value,risk}=intel;
 const signals=value.signals.filter(s=>s.bestPrice.value>1).sort((a,b)=>b.edgePct.value-a.edgePct.value).slice(0,3);
 const lead=signals[0];
 const ranking=Number.isFinite(value.bestEdgePct.value)?value.bestEdgePct.value*quality.score.value:null;
 const leadFair=lead&&lead.fairProbability.value>0?(1/lead.fairProbability.value).toFixed(2):'N/A';
 return <article className="bb-event">
  <div className="bb-event-head">
   <div>
    <div className="bb-event-meta"><span>{SPORT_LABELS[event.sportKey]}</span><span>·</span><span>{event.league.name}</span><span className={event.status==='live'?'bb-live':''}>{event.status==='live'?'LIVE':'PRE-MATCH'}</span></div>
    <div className="bb-event-title">{event.homeTeam.name} <span className="text-slate-600">vs</span> {event.awayTeam.name}</div>
   </div>
   <div className="bb-time">{event.status==='live'?'LIVE':new Date(event.startTime).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})}</div>
  </div>
  <div className="bb-intel-strip">
   <div><small>Edge</small><strong>{lead?edge(lead.edgePct.value):'N/A'}</strong></div>
   <div><small>Confidence</small><strong>{lead?pct(lead.modelProbability.value):'N/A'}</strong></div>
   <div><small>Data quality</small><strong>{quality.score.value?Math.round(quality.score.value*100)+'%':'N/A'}</strong></div>
   <div><small>Risk</small><strong className={riskClass(risk.level)}>{risk.level}</strong></div>
   <div><small>Opportunity rank</small><strong>{ranking===null?'N/A':ranking.toFixed(1)}</strong></div>
  </div>
  <div className="bb-insight">{lead?<><b>Core Engine signal:</b> {lead.label} · edge {edge(lead.edgePct.value)} · fair {leadFair} · {quality.grade} data.</>:<><b>Core Engine:</b> brak kwalifikowanego sygnału dla głównego rynku.</>}</div>
  <div className="bb-markets">
   {signals.map(s=><div className="bb-market" key={s.selectionId}><span>{s.label}</span><button type="button" onClick={()=>onAdd({id:s.selectionId,marketId:intel.market,eventId:event.id,name:s.label,shortName:s.label,odds:s.bestPrice.value,probability:s.modelProbability.value,impliedProbability:s.impliedProbability.value,value:s.edgePct.value/100,ev:s.evPerUnit.value,confidence:s.modelProbability.value,risk:risk.level==='HIGH'?'HIGH':risk.level==='ELEVATED'?'MEDIUM':'LOW',correlationGroup:intel.market})}>{s.bestPrice.value?s.bestPrice.value.toFixed(2):'N/A'}</button></div>)}
  </div>
  <div className="bb-actions">
   <Link className="bb-action" to={'/analysis/'+event.id}><BarChart3 size={13}/> Analiza</Link>
   <Link className="bb-action" to={'/sports/'+event.id}><Activity size={13}/> Event</Link>
   <Link className="bb-action primary" to="/builder"><Zap size={13}/> Builder</Link>
  </div>
 </article>;
}

function DecisionPanel({dataset}:{dataset:ReturnType<typeof useIntelligence>['dataset']}){
 const live=dataset?.events.filter(e=>e.status==='live').length??0;
 const status=dataset?.mode==='LIVE'?'READY':dataset?.mode==='DEMO'?'REVIEW':'SYNCING';
 const statusClass=status==='READY'?'bb-verdict-ready':'bb-verdict-review';
 return <section className="bb-decision-panel" aria-label="Decision Center">
  <div className="bb-decision-head"><div className="bb-decision-label">Decision Center</div><div className="bb-decision-verdict"><div><div className="text-[9px] text-slate-500">DECISION</div><strong className={statusClass}>{status}</strong></div><span className="text-[8px] font-mono text-slate-600">Core state</span></div></div>
  <div className="bb-decision-metrics">
   <div><small>Data freshness</small><strong>{dataset?.mode==='LIVE'?'LIVE':'N/A'}</strong></div>
   <div><small>Live events</small><strong>{live}</strong></div>
   <div><small>Source health</small><strong>{dataset?.providerHealth?.state??'N/A'}</strong></div>
   <div><small>Source quality</small><strong>{dataset?.providerHealth?.successfulSports??'N/A'}</strong></div>
  </div>
  <div className="bb-gate">
   <div className="bb-kicker">Approval Gate</div>
   <div className="bb-gate-row"><span className="bb-gate-dot ok"/><span>Decision</span><b>CORE</b></div>
   <div className="bb-gate-row"><span className="bb-gate-dot wait"/><span>Approval</span><b>HUMAN</b></div>
   <div className="bb-gate-row"><span className="bb-gate-dot"/><span>Execution permission</span><b>GATED</b></div>
   <div className="bb-gate-row"><span className="bb-gate-dot"/><span>Outcome</span><b>LEARNING</b></div>
  </div>
  <div className="p-3 text-[9px] leading-5 text-slate-500">UI pokazuje stan Control Plane. Żaden przycisk nie omija bramy akceptacji.</div>
 </section>;
}

export function EventsPage(){
 const {dataset,phase,error,refresh,nowTick}=useIntelligence();
 const [sport,setSport]=useState<SportKey|'all'>('all');
 const [query,setQuery]=useState('');
 const [liveOnly,setLiveOnly]=useState(false);
 const intel=useMemo(()=>dataset?buildEventIntel(dataset,new Date(nowTick)):[],[dataset,nowTick]);
 const sports=useMemo(()=>{const list=(dataset?.availableSports??[]).map(s=>canonicalSportKey(s.key,s.group,s.title)).filter((x):x is SportKey=>Boolean(x));return [...new Set(list.length?list:intel.map(i=>i.event.sportKey))]},[dataset?.availableSports,intel]);
 const filtered=useMemo(()=>{const q=query.trim().toLowerCase();return intel.filter(i=>(sport==='all'||i.event.sportKey===sport)&&(!liveOnly||i.event.status==='live')&&(!q||i.event.homeTeam.name.toLowerCase().includes(q)||i.event.awayTeam.name.toLowerCase().includes(q)||i.event.league.name.toLowerCase().includes(q))).sort((a,b)=>b.value.bestEdgePct.value*b.quality.score.value-a.value.bestEdgePct.value*a.quality.score.value)},[intel,sport,liveOnly,query]);
 if(phase==='loading'&&!dataset)return <LoadingState label="Synchronizacja danych sportowych…" rows={6}/>;
 if(phase==='error'&&!dataset)return <ErrorState title="Źródło danych niedostępne" detail={error??'Live bookmaker data is unavailable.'} onRetry={()=>void refresh()} retryLabel="Ponów synchronizację"/>;
 return <div className="bb-grid">
  <section className="bb-main">
   <div className="bb-page-head"><div><div className="bb-kicker">BET BUILDER · SPORTS INTELLIGENCE</div><h1 className="bb-page-title">Dzisiejsza inteligencja</h1><span className="sr-only">Wydarzenia sportowe</span><p className="bb-page-lead">Core Engine filtruje dostępne wydarzenia i porządkuje sygnały według edge, jakości danych i ryzyka. Ranking pomaga znaleźć obszary do analizy. Nie zastępuje decyzji silnika.</p></div><Link className="bb-action primary" to="/builder"><Zap size={14}/> Otwórz Builder</Link></div>
   <Telemetry dataset={dataset} count={filtered.length}/>
   <div className="bb-filterbar">
    <label className="sr-only" htmlFor="event-search">Szukaj wydarzenia</label><div className="flex min-h-[38px] flex-1 items-center gap-2 rounded-lg border border-white/[.07] bg-[#0c101a] px-3"><Search size={13} className="text-slate-500"/><input id="event-search" className="w-full border-0 bg-transparent p-0 outline-none" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Szukaj drużyny lub ligi"/></div>
    <select aria-label="Sport" value={sport} onChange={e=>setSport(e.target.value as SportKey|'all')}><option value="all">Wszystkie sporty</option>{sports.map(s=><option key={s} value={s}>{SPORT_LABELS[s]}</option>)}</select>
    <button type="button" className={liveOnly?'active':''} onClick={()=>setLiveOnly(v=>!v)}>{liveOnly?'LIVE':'Wszystkie'}</button>
   </div>
   <div className="bb-section-title"><h2>Najważniejsze okazje</h2><span>{filtered.length} wydarzeń · edge × jakość danych</span></div>
   <div className="bb-events">{filtered.map(i=><EventCard key={i.event.id} intel={i} onAdd={()=>{}}/>)}{!filtered.length?<div className="bb-event"><strong>Brak kwalifikowanych okazji</strong><p className="mt-2 text-xs text-slate-400">Core Engine sprawdził dostępne wydarzenia, lecz bieżące filtry nie zwróciły kwalifikowanego sygnału.</p></div>:null}</div>
  </section>
  <aside className="bb-side"><DecisionPanel dataset={dataset}/></aside>
  <div className="bb-sticky-mobile"><Link className="bb-action primary" to="/builder">Builder</Link><Link className="bb-action" to="/analysis">Decyzje</Link></div>
 </div>;
}