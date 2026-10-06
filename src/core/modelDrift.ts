export interface DriftObservation { feature:string; baseline:number[]; current:number[]; }
export interface DriftResult { feature:string; psi:number; severity:'NONE'|'LOW'|'MEDIUM'|'HIGH'; }
const eps=1e-6;
const normalize=(xs:number[])=>{const s=xs.reduce((a,b)=>a+b,0);if(!Number.isFinite(s)||s<=0)throw new Error('DRIFT_DISTRIBUTION_INVALID');return xs.map(x=>Math.max(eps,x/s));};
export function populationStabilityIndex(baseline:number[],current:number[]):number{
 if(baseline.length!==current.length||baseline.length<2)throw new Error('DRIFT_BINS_INVALID');
 const b=normalize(baseline),c=normalize(current);
 return b.reduce((sum,p,i)=>sum+(c[i]-p)*Math.log(c[i]/p),0);
}
export function detectModelDrift(obs:DriftObservation[]):DriftResult[]{
 return obs.map(o=>{const psi=populationStabilityIndex(o.baseline,o.current);const severity=psi>=.25?'HIGH':psi>=.1?'MEDIUM':psi>=.05?'LOW':'NONE';return {feature:o.feature,psi,severity};});
}