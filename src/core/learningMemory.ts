import type { LearningSummary, PredictionRecord } from './outcomeLearning';
import { summarizeLearning } from './outcomeLearning';

export interface LearningMemoryEntry {
  id:string;
  modelVersion:string;
  createdAt:string;
  lesson:string;
  signal:'POSITIVE'|'NEGATIVE'|'NEUTRAL';
  evidence:{sampleSize:number;settled:number;hitRate:number;brierScore:number;roi:number};
}

export function buildLearningMemory(records:PredictionRecord[], now=new Date().toISOString()):LearningMemoryEntry[] {
  const grouped=new Map<string,PredictionRecord[]>();
  for(const record of records){const list=grouped.get(record.modelVersion)??[];list.push(record);grouped.set(record.modelVersion,list);}
  return [...grouped.entries()].map(([modelVersion,items])=>{
    const summary:LearningSummary=summarizeLearning(items);
    const signal=summary.settled<20?'NEUTRAL':summary.simulatedRoi>0&&summary.brierScore<.2?'POSITIVE':summary.simulatedRoi<0||summary.brierScore>.3?'NEGATIVE':'NEUTRAL';
    const lesson=summary.settled<20?'Collect more verified outcomes before changing the model.':signal==='POSITIVE'?'Retain the current model evidence and test whether the edge persists out of sample.':'Review calibration, market selection and data quality before promoting the next model version.';
    return {id:`LEARN-${modelVersion}-${Date.parse(now)}`,modelVersion,createdAt:now,lesson,signal,evidence:{sampleSize:summary.total,settled:summary.settled,hitRate:summary.hitRate,brierScore:summary.brierScore,roi:summary.simulatedRoi}};
  });
}
