import type {EventWithMarkets} from '../domain/types';
import {rankPredictions,type Prediction} from './predictionEngine';

export type CouponStatus='READY'|'REVIEW'|'BLOCKED';
export interface CouponRequest {events:EventWithMarkets[];targetOdds:number;stake:number;tolerance?:number;maxLegs?:number;minLegOdds?:number;maxLegOdds?:number;minConfidence?:number;}
export interface CouponLeg extends Prediction {eventLabel:string;league:string;startTime:string;}
export interface CouponResult {status:CouponStatus;targetOdds:number;combinedOdds:number;stake:number;potentialReturn:number;potentialProfit:number;estimatedProbability:number;estimatedEv:number;legs:CouponLeg[];blockers:string[];warnings:string[];rationale:string[];}
const finite=(n:number)=>Number.isFinite(n);
const clamp=(n:number,a=0,b=1)=>Math.max(a,Math.min(b,n));

/** Target-odds optimizer. It does not require a requested event count. */
export function generateCoupon(input:CouponRequest):CouponResult {
 const target=finite(input.targetOdds)&&input.targetOdds>1?input.targetOdds:0;
 const stake=finite(input.stake)&&input.stake>=0?input.stake:0;
 const tolerance=clamp(input.tolerance??.15,.05,.35);
 const maxLegs=Math.min(12,Math.max(2,Math.floor(input.maxLegs??10)));
 if(!target)return {status:'BLOCKED',targetOdds:0,combinedOdds:0,stake,potentialReturn:0,potentialProfit:0,estimatedProbability:0,estimatedEv:0,legs:[],blockers:['TARGET_ODDS_INVALID'],warnings:[],rationale:[]};
 const ranked=rankPredictions(input.events).filter(p=>finite(p.marketOdds)&&p.marketOdds>=(input.minLegOdds??1.15)&&p.marketOdds<=(input.maxLegOdds??8)&&p.confidence>=(input.minConfidence??.5));
 const candidates=ranked.map(p=>({...p,quality:p.ev*.42+p.confidence*.33+p.edge*.15+(p.risk==='LOW'?.10:p.risk==='MEDIUM'?.04:0)})).sort((a,b)=>b.quality-a.quality).slice(0,80);
 type State={legs:Prediction[];odds:number;score:number;events:Set<string>;groups:Set<string>};
 let beam:State[]=[{legs:[],odds:1,score:0,events:new Set(),groups:new Set()}];
 const targetLog=Math.log(target);
 const scoreState=(s:State)=>{const distance=Math.abs(Math.log(Math.max(1e-9,s.odds))-targetLog);const quality=s.legs.reduce((a,p)=>a+(p.ev*.42+p.confidence*.33+p.edge*.15+(p.risk==='LOW'?.10:p.risk==='MEDIUM'?.04:0)),0);const overshoot=s.odds>target?Math.min(1,(s.odds-target)/target):0;return quality-distance*1.35-overshoot*1.5;};
 for(let depth=0;depth<maxLegs;depth++){
  const next:State[]=[];
  for(const state of beam){for(const p of candidates){
   if(state.events.has(p.eventId))continue;
   const event=input.events.find(e=>e.id===p.eventId);if(!event||event.status==='FINISHED')continue;
   const correlation=p.correlationGroup||p.marketId;if(state.groups.has(correlation))continue;
   const odds=state.odds*p.marketOdds;if(odds>target*(1+tolerance)&&state.legs.length>0)continue;
   next.push({legs:[...state.legs,p],odds,score:0,events:new Set(state.events).add(p.eventId),groups:new Set(state.groups).add(correlation)});
  }}
  if(!next.length)break;
  next.forEach(s=>s.score=scoreState(s));
  next.sort((a,b)=>Math.abs(Math.log(a.odds)-targetLog)-Math.abs(Math.log(b.odds)-targetLog)||b.score-a.score);
  beam=next.slice(0,140);
 }
 const valid=beam.filter(s=>s.legs.length>=2);
 valid.sort((a,b)=>Math.abs(Math.log(a.odds)-targetLog)-Math.abs(Math.log(b.odds)-targetLog)||b.score-a.score);
 const best=valid[0];
 const blockers:string[]=[],warnings:string[]=[];
 if(!best)blockers.push('NO_QUALIFIED_SELECTIONS');
 if(stake<=0)warnings.push('ZERO_STAKE');
 const legs=(best?.legs??[]).map(p=>{const e=input.events.find(x=>x.id===p.eventId)!;return {...p,eventLabel:e.homeTeam+' vs '+e.awayTeam,league:e.league,startTime:e.startTime};});
 const combined=best?.odds??1;
 const distance=Math.abs(combined-target)/target;
 if(best&&distance>tolerance)warnings.push('TARGET_NOT_REACHED');
 const probability=legs.reduce((p,s)=>p*s.probability,1);
 const ev=combined*probability-1;
 return {status:blockers.length?'BLOCKED':warnings.length?'REVIEW':'READY',targetOdds:target,combinedOdds:combined,stake,potentialReturn:stake*combined,potentialProfit:Math.max(0,stake*combined-stake),estimatedProbability:probability,estimatedEv:ev,legs,blockers,warnings,rationale:[`Optimized ${ranked.length} qualified selections around target odds.`,`Target ${target.toFixed(2)} · generated ${combined.toFixed(2)} · deviation ${(distance*100).toFixed(1)}%.`,'No duplicate event; correlation controlled by event/market group.',`Model probability ${(probability*100).toFixed(1)}% · EV ${(ev*100).toFixed(1)}%.`]};
}