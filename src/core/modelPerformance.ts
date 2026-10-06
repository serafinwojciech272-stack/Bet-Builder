import type { PredictionRecord } from './outcomeLearning';
import { summarizeLearning } from './outcomeLearning';
import { gradePrediction } from './outcomeEngine';

export interface ModelPerformance {
  modelVersion:string;
  sampleSize:number;
  settled:number;
  hitRate:number;
  brierScore:number;
  logLoss:number;
  simulatedRoi:number;
  meanClvPct:number|null;
  positiveClvRate:number|null;
  confidenceAccuracy:number|null;
  maxDrawdown:number;
  eligible:boolean;
}

export function evaluateModelPerformance(records:PredictionRecord[], minimumSample=20):ModelPerformance[] {
  const groups=new Map<string,PredictionRecord[]>();
  for(const record of records){
    const list=groups.get(record.modelVersion)??[];
    list.push(record);
    groups.set(record.modelVersion,list);
  }
  return [...groups.entries()].map(([modelVersion,items])=>{
    const summary=summarizeLearning(items);
    const settled=items.filter(x=>x.outcome!=='PENDING'&&x.outcome!=='VOID');
    const grades=settled.map(x=>gradePrediction(x,x.outcome as 'WON'|'LOST'|'PUSH',x.settledAt??x.createdAt));
    const clv=grades.filter(x=>x.clvPct!==null).map(x=>x.clvPct as number);
    const confidence=grades.filter(x=>x.confidenceAccurate!==null).map(x=>x.confidenceAccurate?1:0);
    let equity=0,peak=0,maxDrawdown=0;
    for(const grade of grades){equity+=grade.roi??0;peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,peak-equity);}
    return {
      modelVersion,sampleSize:items.length,settled:summary.settled,hitRate:summary.hitRate,brierScore:summary.brierScore,
      logLoss:settled.length?grades.reduce((s,x)=>s+(x.logLoss??0),0)/settled.length:0,
      simulatedRoi:summary.simulatedRoi,meanClvPct:clv.length?clv.reduce((a,b)=>a+b,0)/clv.length:null,
      positiveClvRate:clv.length?clv.filter(x=>x>0).length/clv.length:null,
      confidenceAccuracy:confidence.length?confidence.reduce((a,b)=>a+b,0)/confidence.length:null,
      maxDrawdown,eligible:summary.settled>=minimumSample,
    };
  }).sort((a,b)=>(b.simulatedRoi-a.simulatedRoi)||(a.brierScore-b.brierScore));
}
