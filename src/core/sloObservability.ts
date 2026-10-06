export type SloStatus='HEALTHY'|'AT_RISK'|'BREACHED';
export interface SloSnapshot { availability:number; latencyP95Ms:number; errorRate:number; freshness:number; }
export interface SloTarget { availability:number; latencyP95Ms:number; errorRate:number; freshness:number; }
export interface SloResult { status:SloStatus; violations:string[]; score:number; }
const clamp=(v:number)=>Math.max(0,Math.min(1,Number.isFinite(v)?v:0));
export function evaluateSlo(snapshot:SloSnapshot,target:SloTarget):SloResult {
 const violations:string[]=[];
 if(snapshot.availability<target.availability)violations.push('AVAILABILITY');
 if(snapshot.latencyP95Ms>target.latencyP95Ms)violations.push('LATENCY_P95');
 if(snapshot.errorRate>target.errorRate)violations.push('ERROR_RATE');
 if(snapshot.freshness<target.freshness)violations.push('FRESHNESS');
 const availabilityScore=target.availability>0?snapshot.availability/target.availability:0;
 const latencyScore=target.latencyP95Ms>0?target.latencyP95Ms/Math.max(snapshot.latencyP95Ms,1):0;
 const errorScore=target.errorRate===0?(snapshot.errorRate===0?1:0):target.errorRate/Math.max(snapshot.errorRate,Number.EPSILON);
 const freshnessScore=target.freshness>0?snapshot.freshness/target.freshness:0;
 const score=clamp(Math.min(availabilityScore,latencyScore,errorScore,freshnessScore));
 return {status:score>=1?'HEALTHY':score>=.85?'AT_RISK':'BREACHED',violations,score};
}