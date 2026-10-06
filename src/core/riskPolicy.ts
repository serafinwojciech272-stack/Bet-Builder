import type { Selection } from '../domain/types';
export type PolicyDecision='CLEAR'|'REVIEW'|'BLOCKED';
export type RiskReason='STALE_DATA'|'LOW_CONFIDENCE'|'HIGH_CORRELATION'|'CRITICAL_RISK'|'NEGATIVE_EV'|'INVALID_PRICE'|'INVALID_PROBABILITY'|'INSUFFICIENT_EVIDENCE'|'SOURCE_DEGRADED'|'DUPLICATE_EVENT'|'LIVE_EVENT';
export interface RiskPolicyInput { selections:Selection[]; dataFreshness:number; evidenceQuality:number; providerState:'HEALTHY'|'DEGRADED'|'STALE'|'OFFLINE'; allowLive?:boolean; }
export interface RiskPolicyResult { decision:PolicyDecision; score:number; reasons:RiskReason[]; trace:string[]; }
const clamp=(v:number)=>Math.max(0,Math.min(1,Number.isFinite(v)?v:0));
export function evaluateRiskPolicy(input:RiskPolicyInput):RiskPolicyResult {
 const reasons:RiskReason[]=[]; const s=input.selections;
 if(!s.length)reasons.push('INSUFFICIENT_EVIDENCE');
 if(input.dataFreshness<.5||input.providerState==='STALE')reasons.push('STALE_DATA');
 if(input.evidenceQuality<.5)reasons.push('INSUFFICIENT_EVIDENCE');
 if(input.providerState==='OFFLINE'||input.providerState==='DEGRADED')reasons.push('SOURCE_DEGRADED');
 if(s.some(x=>x.risk==='CRITICAL'))reasons.push('CRITICAL_RISK');
 if(s.some(x=>x.confidence<.5))reasons.push('LOW_CONFIDENCE');
 if(s.some(x=>!Number.isFinite(x.odds)||x.odds<=1))reasons.push('INVALID_PRICE');
 if(s.some(x=>!Number.isFinite(x.probability)||x.probability<=0||x.probability>=1))reasons.push('INVALID_PROBABILITY');
 if(new Set(s.map(x=>x.eventId)).size<s.length)reasons.push('DUPLICATE_EVENT');
 if(s.some(x=>x.eventId.startsWith('live:'))&&!input.allowLive)reasons.push('LIVE_EVENT');
 const probability=s.reduce((p,x)=>p*x.probability,1),odds=s.reduce((p,x)=>p*x.odds,1);
 if(s.length&&probability*odds-1<0)reasons.push('NEGATIVE_EV');
 const unique=[...new Set(reasons)]; const confidence=s.length?s.reduce((a,x)=>a+x.confidence,0)/s.length:0;
 const score=clamp(input.dataFreshness*.3+input.evidenceQuality*.3+confidence*.25+(input.providerState==='HEALTHY'?.15:0));
 const hard=['CRITICAL_RISK','INVALID_PRICE','INVALID_PROBABILITY','INSUFFICIENT_EVIDENCE','DUPLICATE_EVENT'].some(x=>unique.includes(x as RiskReason));
 const decision=hard||input.providerState==='OFFLINE'?'BLOCKED':unique.length?'REVIEW':'CLEAR';
 return {decision,score,reasons:unique,trace:[`Risk score ${(score*100).toFixed(0)}%; policy ${decision}.`,...unique.map(x=>`reason=${x}`)]};
}