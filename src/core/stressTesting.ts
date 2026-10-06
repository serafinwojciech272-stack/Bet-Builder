export interface StressPosition { id:string; baseValue:number; probability:number; correlationGroup?:string; }
export interface StressScenario { name:string; probabilityDelta:number; valueMultiplier:number; }
export interface StressResult { scenario:string; baseExposure:number; stressedExposure:number; delta:number; breach:boolean; }
export function runStressTest(positions:StressPosition[],scenarios:StressScenario[],maxLoss:number):StressResult[]{
 if(maxLoss<0||positions.some(p=>p.baseValue<0||p.probability<0||p.probability>1))throw new Error('STRESS_INPUT_INVALID');
 return scenarios.map(s=>{if(s.valueMultiplier<0)throw new Error('STRESS_MULTIPLIER_INVALID');const base=positions.reduce((a,p)=>a+p.baseValue*p.probability,0);const stressed=positions.reduce((a,p)=>a+p.baseValue*Math.max(0,Math.min(1,p.probability+s.probabilityDelta))*s.valueMultiplier,0);return {scenario:s.name,baseExposure:base,stressedExposure:stressed,delta:stressed-base,breach:stressed>maxLoss};});
}