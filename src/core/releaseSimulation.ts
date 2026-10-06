export type SimulationDecision='PROMOTE'|'HOLD'|'BLOCK';
export interface SimulationMetric { baseline:number; candidate:number; maxRegression:number; }
export interface ReleaseSimulationInput { smokePassed:boolean; securityPassed:boolean; integrityPassed:boolean; metrics:SimulationMetric[]; }
export interface ReleaseSimulationResult { decision:SimulationDecision; regressions:number; reasons:string[]; }
export function simulateRelease(input:ReleaseSimulationInput):ReleaseSimulationResult {
 const reasons:string[]=[];
 if(!input.smokePassed)reasons.push('SMOKE_FAILURE');
 if(!input.securityPassed)reasons.push('SECURITY_FAILURE');
 if(!input.integrityPassed)reasons.push('INTEGRITY_FAILURE');
 let regressions=0;
 input.metrics.forEach(m=>{if(m.baseline===0){if(m.candidate<0)regressions++;return;}const regression=(m.baseline-m.candidate)/Math.abs(m.baseline);if(regression>m.maxRegression)regressions++;});
 if(regressions)reasons.push('METRIC_REGRESSION');
 return {decision:reasons.some(r=>r.endsWith('FAILURE'))?'BLOCK':regressions?'HOLD':'PROMOTE',regressions,reasons};
}