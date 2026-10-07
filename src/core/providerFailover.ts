export type ProviderHealth='HEALTHY'|'DEGRADED'|'OFFLINE';
export interface ProviderEndpoint { id:string; priority:number; health:ProviderHealth; latencyMs:number; errorRate:number; }
export interface FailoverDecision { selected:string|null; mode:'PRIMARY'|'FAILOVER'|'DEGRADED'|'NO_PROVIDER'; reason:string; }
export function selectProvider(providers:ProviderEndpoint[]):FailoverDecision {
 const ordered=[...providers].sort((a,b)=>a.priority-b.priority||a.latencyMs-b.latencyMs);
 const primary=ordered[0];
 if(!primary)return {selected:null,mode:'NO_PROVIDER',reason:'NO_PROVIDER_CONFIGURED'};
 const eligible=ordered.filter(p=>p.health!=='OFFLINE');
 if(!eligible.length)return {selected:null,mode:'NO_PROVIDER',reason:'NO_HEALTHY_PROVIDER'};
 const p=eligible[0];
 if(p.health==='DEGRADED')return {selected:p.id,mode:'DEGRADED',reason:p.id===primary.id?'PRIMARY_DEGRADED':'FAILOVER_PROVIDER_DEGRADED'};
 return {selected:p.id,mode:p.id===primary.id?'PRIMARY':'FAILOVER',reason:p.id===primary.id?'PRIMARY_HEALTHY':'PRIMARY_UNAVAILABLE'};
}
