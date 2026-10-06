export interface ProportionSignificance { successes:number; trials:number; z:number; pValueApprox:number; significant:boolean; }
export interface MeanSignificance { mean:number; n:number; standardError:number; z:number; pValueApprox:number; significant:boolean; }
const erf=(x:number)=>{const s=x<0?-1:1,a=Math.abs(x),t=1/(1+.3275911*a),p=1-((((1.061405429*t-.356563782)*t+1.781477937)*t-1.821255978)*t+1.330274429*t)*Math.exp(-a*a);return s*p;};
const normalTwoTail=(z:number)=>1-(erf(Math.abs(z)/Math.SQRT2));
export function proportionSignificance(successes:number,trials:number,baseline=.5,alpha=.05):ProportionSignificance{
 if(trials<1||successes<0||successes>trials||baseline<=0||baseline>=1)throw new Error('PROPORTION_INPUT_INVALID');
 const p=successes/trials,se=Math.sqrt(baseline*(1-baseline)/trials),z=(p-baseline)/se,pv=normalTwoTail(z);return {successes,trials,z,pValueApprox:pv,significant:pv<alpha};
}
export function meanSignificance(values:number[],baseline=0,alpha=.05):MeanSignificance{
 if(values.length<2||!values.every(Number.isFinite))throw new Error('MEAN_INPUT_INVALID');
 const mean=values.reduce((a,b)=>a+b,0)/values.length;const variance=values.reduce((s,x)=>s+(x-mean)**2,0)/(values.length-1);const se=Math.sqrt(variance/values.length);const z=se===0?(mean===baseline?0:Infinity):(mean-baseline)/se;const pv=se===0?(mean===baseline?1:0):normalTwoTail(z);return {mean,n:values.length,standardError:se,z,pValueApprox:pv,significant:pv<alpha};
}