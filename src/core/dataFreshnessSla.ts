export interface FreshnessSla { source:string; maxAgeSeconds:number; criticalAgeSeconds:number; }
export interface FreshnessObservation { source:string; observedAt:string; now:string; }
export interface FreshnessResult { source:string; ageSeconds:number; status:'FRESH'|'STALE'|'CRITICAL'; withinSla:boolean; }
export function evaluateFreshness(sla:FreshnessSla,observation:FreshnessObservation):FreshnessResult{
 if(!sla.source||sla.maxAgeSeconds<0||sla.criticalAgeSeconds<0)throw new Error('FRESHNESS_SLA_INVALID');
 const observed=Date.parse(observation.observedAt),now=Date.parse(observation.now);
 if(Number.isNaN(observed)||Number.isNaN(now))throw new Error('FRESHNESS_TIMESTAMP_INVALID');
 if(observation.source!==sla.source)throw new Error('FRESHNESS_SOURCE_MISMATCH');
 const ageSeconds=Math.max(0,(now-observed)/1000);
 const status=ageSeconds>=sla.criticalAgeSeconds?'CRITICAL':ageSeconds>sla.maxAgeSeconds?'STALE':'FRESH';
 return {source:sla.source,ageSeconds,status,withinSla:status==='FRESH'};
}