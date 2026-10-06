export type QuotaDecision='ALLOW'|'THROTTLE'|'BLOCK';
export interface QuotaState { used:number; limit:number; windowSeconds:number; }
export interface QuotaResult { decision:QuotaDecision; remaining:number; utilization:number; reason:string; }
export function evaluateQuota(state:QuotaState,softLimit=.8,hardLimit=1):QuotaResult {
 if(state.limit<=0)throw new Error('QUOTA_LIMIT_INVALID');
 const utilization=state.used/state.limit; const remaining=Math.max(0,state.limit-state.used);
 if(utilization>=hardLimit)return {decision:'BLOCK',remaining,utilization,reason:'QUOTA_HARD_LIMIT'};
 if(utilization>=softLimit)return {decision:'THROTTLE',remaining,utilization,reason:'QUOTA_SOFT_LIMIT'};
 return {decision:'ALLOW',remaining,utilization,reason:'QUOTA_HEALTHY'};
}