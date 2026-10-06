export interface Interval { estimate:number; lower:number; upper:number; confidence:number; method:'WILSON'|'NORMAL_MEAN'; }
const zFor=(confidence:number)=>confidence>=.995?2.807:confidence>=.99?2.576:confidence>=.95?1.96:confidence>=.9?1.645:1;
export function wilsonInterval(successes:number,trials:number,confidence=.95):Interval{
 if(trials<1||successes<0||successes>trials||confidence<=0||confidence>=1)throw new Error('WILSON_INPUT_INVALID');
 const p=successes/trials,z=zFor(confidence),den=1+z*z/trials,center=(p+z*z/(2*trials))/den,half=z*Math.sqrt(p*(1-p)/trials+z*z/(4*trials*trials))/den;
 return {estimate:p,lower:Math.max(0,center-half),upper:Math.min(1,center+half),confidence,method:'WILSON'};
}
export function meanInterval(values:number[],confidence=.95):Interval{
 if(values.length<2||!values.every(Number.isFinite)||confidence<=0||confidence>=1)throw new Error('MEAN_INTERVAL_INPUT_INVALID');
 const mean=values.reduce((a,b)=>a+b,0)/values.length,variance=values.reduce((s,x)=>s+(x-mean)**2,0)/(values.length-1),se=Math.sqrt(variance/values.length),z=zFor(confidence);
 return {estimate:mean,lower:mean-z*se,upper:mean+z*se,confidence,method:'NORMAL_MEAN'};
}