export type ProviderMode='PRIMARY'|'FAILOVER'|'DEGRADED'|'OFFLINE';
export interface ProviderHealth { id:string; healthy:boolean; latencyMs:number; freshness:number; priority:number; }
export interface ProviderRoute { mode:ProviderMode; providerId?:string; reason:string; }
export function routeProvider(providers:ProviderHealth[],maxLatencyMs=2000,minFreshness=.7):ProviderRoute {
 const eligible=providers.filter(p=>p.healthy&&p.latencyMs<=maxLatencyMs&&p.freshness>=minFreshness).sort((a,b)=>a.priority-b.priority);
 if(eligible.length)return {mode:eligible[0].priority===0?'PRIMARY':'FAILOVER',providerId:eligible[0].id,reason:'HEALTHY_PROVIDER_SELECTED'};
 const degraded=providers.filter(p=>p.healthy).sort((a,b)=>a.priority-b.priority)[0];
 if(degraded)return {mode:'DEGRADED',providerId:degraded.id,reason:'NO_PROVIDER_MEETS_NORMAL_SLA'};
 return {mode:'OFFLINE',reason:'NO_HEALTHY_PROVIDER'};
}