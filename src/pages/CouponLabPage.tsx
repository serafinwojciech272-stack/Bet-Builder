import {useMemo,useState} from 'react';
import {Activity,CalendarDays,ChevronDown,RefreshCw,Sparkles,Target,WalletCards,Zap} from 'lucide-react';
import {useIntelligence} from '../state/IntelligenceProvider';
import {liveEvents} from '../services/liveAdapter';
import {generateCoupon,type CouponResult} from '../core/couponEngine';

const SPORT_OPTIONS=[['all','Wszystkie dyscypliny'],['soccer','Piłka nożna'],['basketball','Koszykówka'],['tennis','Tenis'],['icehockey','Hokej'],['volleyball','Siatkówka'],['baseball','Baseball'],['americanfootball','Football amerykański'],['handball','Piłka ręczna'],['tabletennis','Tenis stołowy'],['darts','Dart']] as const;
function day(offset:number){const d=new Date();d.setDate(d.getDate()+offset);return d.toISOString().slice(0,10);}
function prettyDate(value:string){return new Intl.DateTimeFormat('pl-PL',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value+'T12:00:00'));}

export default function CouponLabPage(){
 const {dataset,selectedDate,refresh,runAnalysis,phase}=useIntelligence();
 const [target,setTarget]=useState('6.00'),[stake,setStake]=useState('20'),[sport,setSport]=useState('all');
 const [from,setFrom]=useState(day(0)),[to,setTo]=useState(day(1)),[liveOnly,setLiveOnly]=useState(false);
 const [result,setResult]=useState<CouponResult|null>(null),[ai,setAi]=useState<Record<string,'loading'|'ok'|'failed'>>({}),[message,setMessage]=useState('');
 const events=useMemo(()=>dataset?liveEvents(dataset):[],[dataset]);
 const filtered=useMemo(()=>events.filter(e=>e.startTime.slice(0,10)>=from&&e.startTime.slice(0,10)<=to&&(sport==='all'||e.sport===sport)&&(!liveOnly||e.status==='LIVE')&&e.status!=='FINISHED'),[events,from,to,sport,liveOnly]);
 const liveCount=filtered.filter(e=>e.status==='LIVE').length;
 const generate=async()=>{
  if(!dataset){setMessage('Brak danych sportowych. Odśwież feed.');return;}
  if(from>to){setMessage('Zakres dat jest nieprawidłowy.');return;}
  const coupon=generateCoupon({events:filtered,targetOdds:Number(target),stake:Number(stake),tolerance:.18,maxLegs:12,minLegOdds:1.15,maxLegOdds:8,minConfidence:.5});
  setResult(coupon);
  if(coupon.status==='BLOCKED'){setMessage('Nie znaleziono wystarczająco dobrych selekcji dla wybranych filtrów.');return;}
  const next:Record<string,'loading'|'ok'|'failed'>={};coupon.legs.forEach(l=>next[l.eventId]='loading');setAi(next);
  setMessage('Core Engine analizuje wybrane rynki i weryfikuje świeżość danych…');
  await Promise.all(coupon.legs.map(async leg=>{try{const a=await runAnalysis(leg.eventId,{depth:'deep'});setAi(v=>({...v,[leg.eventId]:a?'ok':'failed'}));}catch{setAi(v=>({...v,[leg.eventId]:'failed'}));}}));
  setMessage('Kupon wygenerowany na podstawie aktualnego feedu. Weryfikacja człowieka pozostaje wymagana.');
 };
 return <div className="bb-premium">
  <div className="bb-hero"><div className="bb-hero-bg"/><div className="bb-hero-grid"/><div className="bb-hero-content">
   <div className="bb-kicker"><span className="bb-live-dot"/> LIVE SPORTS · REAL ODDS · AI BUILDER</div>
   <div className="bb-hero-row"><div><h1>Bet Builder</h1><p>Buduj kupon według <strong>stawki, kursu, dyscypliny i zakresu dat</strong>. Nie wybierasz liczby zdarzeń. Silnik dobiera kombinację pod docelowy kurs.</p></div><div className="bb-hero-stat"><b>{liveCount}</b><span>LIVE NOW</span></div></div>
   <div className="bb-filterbar">
    <div className="bb-field"><label><WalletCards size={14}/> STAWKA</label><div className="bb-input"><input value={stake} onChange={e=>setStake(e.target.value)} type="number" min="0" step=".01"/><span>PLN</span></div></div>
    <div className="bb-field"><label><Target size={14}/> KURS ŁĄCZNY</label><div className="bb-input"><input value={target} onChange={e=>setTarget(e.target.value)} type="number" min="1.01" step=".01"/><span>×</span></div></div>
    <div className="bb-field bb-wide"><label><Activity size={14}/> DYSCYPLINA</label><div className="bb-select"><select value={sport} onChange={e=>{setSport(e.target.value);void refresh(selectedDate,true,e.target.value)}}>{SPORT_OPTIONS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><ChevronDown size={14}/></div></div>
    <div className="bb-field"><label><CalendarDays size={14}/> OD</label><div className="bb-input"><input value={from} onChange={e=>setFrom(e.target.value)} type="date"/></div></div>
    <div className="bb-field"><label><CalendarDays size={14}/> DO</label><div className="bb-input"><input value={to} onChange={e=>setTo(e.target.value)} type="date"/></div></div>
    <button className={liveOnly?'bb-toggle active':'bb-toggle'} onClick={()=>setLiveOnly(v=>!v)} type="button"><span className="bb-toggle-dot"/>{liveOnly?'TYLKO LIVE':'LIVE + NADCHODZĄCE'}</button>
   </div>
   <div className="bb-quick"><span>SZYBKI KURS</span>{['3.00','5.00','6.00','10.00','20.00','50.00'].map(v=><button key={v} className={target===v?'active':''} onClick={()=>setTarget(v)} type="button">×{v}</button>)}<button className="bb-refresh" onClick={()=>void refresh(selectedDate,true,sport)} type="button"><RefreshCw size={13}/>{phase==='loading'?'SYNC…':'ODŚWIEŻ FEED'}</button></div>
   <button className="bb-generate" onClick={()=>void generate()} disabled={!dataset||phase==='loading'} type="button"><Sparkles size={18}/> GENERUJ KUPON <span>AI + ODDS ENGINE</span><Zap size={16}/></button>
   {message&&<div className="bb-message">{message}</div>}
  </div></div>
  <div className="bb-board">
   <section className="bb-events"><div className="bb-section-head"><div><span className="bb-label">MARKET BOARD</span><h2>Dostępne wydarzenia</h2></div><div className="bb-count">{filtered.length} zdarzeń · {dataset?.provider??'feed'}</div></div>
    <div className="bb-date-strip"><span><CalendarDays size={13}/>{prettyDate(from)} — {prettyDate(to)}</span><span>{liveCount} LIVE</span></div>
    <div className="bb-event-list">{filtered.slice(0,24).map(e=><article className="bb-event" key={e.id}><div className="bb-event-top"><span className={e.status==='LIVE'?'bb-live-tag':'bb-time-tag'}>{e.status==='LIVE'?<><span/> LIVE</>:new Date(e.startTime).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})}</span><span>{e.sport.toUpperCase()} · {e.league}</span></div><div className="bb-match"><div><b>{e.homeTeam}</b><small>{e.status==='LIVE'?'TRWA MECZ':'GOSPODARZ'}</small></div><strong>VS</strong><div className="right"><b>{e.awayTeam}</b><small>{e.status==='LIVE'?'NA ŻYWO':'GOŚĆ'}</small></div></div><div className="bb-market-row">{e.markets.slice(0,4).map(m=><div className="bb-market" key={m.id}><span>{m.name}</span><div>{m.selections.slice(0,3).map(s=><span key={s.id}><b>{s.shortName}</b><strong>{s.odds.toFixed(2)}</strong></span>)}</div></div>)}</div></article>)}</div>
    {!filtered.length&&<div className="bb-empty"><Target size={24}/><b>Brak wydarzeń dla tych filtrów</b><span>Zmień dyscyplinę, zakres dat lub wyłącz filtr LIVE.</span></div>}
   </section>
   <aside className="bb-ticket"><div className="bb-ticket-head"><div><span className="bb-label">AI COUPON</span><h2>Twój kupon</h2></div>{result&&<span className={result.status==='READY'?'bb-status-ready':'bb-status-review'}>{result.status}</span>}</div>
    {!result?<div className="bb-ticket-empty"><Sparkles size={26}/><b>Gotowy do budowy</b><p>Ustaw stawkę, kurs, dyscyplinę i daty. Liczba zdarzeń jest dobierana automatycznie przez silnik.</p></div>:<>
     <div className="bb-total"><span>KURS WYGENEROWANY</span><strong>{result.combinedOdds.toFixed(2)}</strong><small>cel ×{result.targetOdds.toFixed(2)}</small></div>
     <div className="bb-payout"><div><span>STAWKA</span><b>{result.stake.toFixed(2)} PLN</b></div><div><span>MOŻLIWA WYPŁATA</span><b>{result.potentialReturn.toFixed(2)} PLN</b></div></div>
     <div className="bb-legs">{result.legs.map((l,i)=><div className="bb-leg" key={l.selectionId}><div className="bb-leg-no">{i+1}</div><div><b>{l.eventLabel}</b><span>{l.label} · {l.league}</span><small>{l.risk} · conf. {(l.confidence*100).toFixed(0)}% · {ai[l.eventId]==='loading'?'AI ANALYZING':ai[l.eventId]==='ok'?'AI VERIFIED':'AI REVIEW'}</small></div><strong>{l.marketOdds.toFixed(2)}</strong></div>)}</div>
     {result.warnings.length>0&&<div className="bb-warning">{result.warnings.join(' · ')}</div>}
     <div className="bb-explain"><span>AI LOGIC</span>{result.rationale.slice(0,3).map(x=><p key={x}>• {x}</p>)}</div>
     <div className="bb-responsible">Wynik jest modelem analitycznym, nie gwarancją. Przed użyciem zweryfikuj aktualny kurs, rynek i status wydarzenia.</div>
    </>}
   </aside>
  </div>
 </div>;
}