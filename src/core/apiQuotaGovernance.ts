export interface QuotaPolicy { provider:string; windowMs:number; maxRequests:number; maxCost:number; }
export interface QuotaUsage { provider:string; windowMs:number; requests:number; cost:number; }
export interface QuotaDecision { allowed:boolean; remainingRequests:number; remainingCost:number; reason:string; }
export function evaluateQuota(policy:QuotaPolicy, usage:QuotaUsage):QuotaDecision {
 if(policy.provider!==usage.provider||policy.windowMs!==usage.windowMs)return {allowed:false,remainingRequests:0,remainingCost:0,reason:'POLICY_MISMATCH'};
 const rr=Math.max(0,policy.maxRequests-usage.requests), rc=Math.max(0,policy.maxCost-usage.cost);
 return {allowed:rr>0&&rc>0,remainingRequests:rr,remainingCost:rc,reason:rr<=0?'REQUEST_LIMIT':rc<=0?'COST_LIMIT':'WITHIN_QUOTA'};
}
