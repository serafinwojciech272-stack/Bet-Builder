import type {EventWithMarkets} from '../domain/types';
import {rankPredictions,type Prediction} from './predictionEngine';
export type CouponStatus='READY'|'REVIEW'|'BLOCKED';
export interface CouponRequest {events:EventWithMarkets[];targetOdds:number;stake:number;tolerance?:number;maxLegs?:number;minLegOdds?:number;maxLegOdds?:number;minConfidence?:number;}
export interface CouponLeg extends Prediction {eventLabel:string;league:string;startTime:string;}
export interface CouponResult {status:CouponStatus;targetOdds:number;combinedOdds:number;stake:number;potentialReturn:number;potentialProfit:number;estimatedProbability:number;estimatedEv:number;legs:CouponLeg[];blockers:string[];warnings:string[];rationale:string[];}
const finite=(n:number)=>Number.isFinite(n);
export function generateCoupon(input:CouponRequest):CouponResult {
 const target=finite(input.targetOdds)&&input.targetOdds>1?input.targetOdds:0,stake=finite(input.stake)&&input.stake>=0?input.stake:0,tolerance=Math.max(.01,Math.min(.5,input.tolerance??.2)),maxLegs=Math.min(12,Math.max(1,Math.floor(input.maxLegs??8)));
 if(!target)return {status:'BLOCKED',targetOdds:0,combinedOdds:0,stake,potentialReturn:0,potentialProfit:0,estimatedProbability:0,estimatedEv:0,legs:[],blockers:['TARGET_ODDS_INVALID'],warnings:[],rationale:[]};
 const ranked=rankPredictions(input.events).filter(p=>finite(p.marketOdds)&&p.marketOdds>=(input.minLegOdds??1.2)&&p.marketOdds<=(input.maxLegOdds??10)&&p.confidence>=(input.minConfidence??.55));
 const selected:CouponLeg[]=[],usedEvents=new Set<string>(),usedMarkets=new Set<string>();let combined=1;
 const events=input.events;const distance=(o:number)=>Math.abs(Math.log(o/target));
 for(const p of [...ranked].sort((a,b)=>distance(a.marketOdds)-distance(b.marketOdds)||b.ev-a.ev)){
  if(selected.length>=maxLegs||usedEvents.has(p.eventId)||usedMarkets.has(p.marketId))continue;
  const next=combined*p.marketOdds;if(next>target*(1+tolerance)&&selected.length)continue;
  const e=events.find(x=>x.id===p.eventId);if(!e)continue;
  selected.push({...p,eventLabel:e.homeTeam+' vs '+e.awayTeam,league:e.league,startTime:e.startTime});combined=next;usedEvents.add(p.eventId);usedMarkets.add(p.marketId);
  if(combined>=target*(1-tolerance))break;
 }
 const blockers:string[]=[],warnings:string[]=[];
 if(!selected.length)blockers.push('NO_QUALIFIED_SELECTIONS');
 if(stake<=0)warnings.push('ZERO_STAKE');
 if(selected.length&&combined<target*(1-tolerance))warnings.push('TARGET_NOT_REACHED');
 const probability=selected.reduce((p,s)=>p*s.probability,1),ev=combined*probability-1;
 return {status:blockers.length?'BLOCKED':warnings.length?'REVIEW':'READY',targetOdds:target,combinedOdds:combined,stake,potentialReturn:stake*combined,potentialProfit:Math.max(0,stake*combined-stake),estimatedProbability:probability,estimatedEv:ev,legs:selected,blockers,warnings,rationale:[`Core Engine ranked ${ranked.length} qualified selections.`,`Target ${target.toFixed(2)} · generated ${combined.toFixed(2)}.`,`Probability ${(probability*100).toFixed(1)}% · model EV ${(ev*100).toFixed(1)}%.`]};
}