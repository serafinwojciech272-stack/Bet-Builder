export type ProviderHealth='HEALTHY'|'DEGRADED'|'OFFLINE';
export interface ProviderEndpoint { id:string; priority:number; health:ProviderHealth; latencyMs:number; errorRate:number; }
export interface FailoverDecision { selected:string|null; mode:'PRIMARY'|'FAILOVER'|'DEGRADED'|'NO_PROVIDER'; reason:string; }
export function selectProvider(providers:ProviderEndpoint[]):FailoverDecision {
 const eligible=providers.filter(p=>p.health!=='OFFLINE').sort((a,b)=>a.priority-b.priority||a.latencyMs-b.latencyMs);
 if(!eligible.length)return {selected:null,mode:'NO_PROVIDER',reason:'NO_HEALTHY_PROVIDER'};
 const p=eligible[0]; const primary=[...providers].sort((a,b)=>a.priority-b.priority)[0];
 if(p.health==='DEGRADED')return {selected:p.id,mode:'DEGRADED',reason:'BEST_AVAILABLE_PROVIDER'};
 return {selected:p.id,mode:p.id===primary?.id?'PRIMARY':'FAILOVER',reason:p.id===primary?.id?'PRIMARY_HEALTHY':'PRIMARY_UNAVAILABLE'};
}
