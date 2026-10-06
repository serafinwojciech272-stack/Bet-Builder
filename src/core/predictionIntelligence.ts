import type { Prediction } from './predictionEngine';
import type { PredictionRecord } from './outcomeLearning';
import { summarizeLearning } from './outcomeLearning';

export type ReplayOutcome = 'PENDING' | 'WON' | 'LOST' | 'PUSH' | 'VOID';
export interface DecisionReplay {
  predictionId:string; eventId:string; capturedAt:string; modelVersion:string;
  outcome:ReplayOutcome; probability:number; impliedProbability:number; edge:number;
  confidence:number; risk:string; odds:number; reasons:string[];
  stages:string[];
}
export interface TournamentEntry {
  modelVersion:string; sampleSize:number; settled:number; wins:number; losses:number;
  hitRate:number; brierScore:number; simulatedRoi:number; calibration:number;
  eligible:boolean; rank:number|null;
}
export interface DecisionExplanation {
  headline:string; supporting:string[]; neutral:string[]; opposing:string[]; risk:string;
}
const pct=(v:number)=>`${(v*100).toFixed(1)}%`;
export function createDecisionReplay(prediction:Prediction, outcome:ReplayOutcome='PENDING', capturedAt=new Date().toISOString()):DecisionReplay {
  return {
    predictionId:prediction.selectionId,eventId:prediction.eventId,capturedAt,modelVersion:prediction.modelVersion,
    outcome,probability:prediction.probability,impliedProbability:prediction.marketOdds>0?1/prediction.marketOdds:0,
    edge:prediction.edge,confidence:prediction.confidence,risk:prediction.risk,odds:prediction.marketOdds,reasons:[...prediction.reasons],
    stages:['DATA SNAPSHOT','MODEL ANALYSIS','PREDICTION CREATED','FINAL DECISION','OUTCOME','GRADING','LEARNING'],
  };
}
export function explainPrediction(prediction:Prediction):DecisionExplanation {
  const supporting:string[]=[]; const opposing:string[]=[]; const neutral:string[]=[];
  if(prediction.edge>0)supporting.push(`Model probability ${pct(prediction.probability)} exceeds market implied probability ${pct(1/prediction.marketOdds)}.`);
  else opposing.push(`Model probability does not exceed the market implied probability (${pct(1/prediction.marketOdds)}).`);
  if(prediction.ev>0)supporting.push(`Expected value is positive at ${(prediction.ev*100).toFixed(1)}%.`);
  else opposing.push('Expected value is not positive.');
  if(prediction.confidence>=.75)supporting.push(`Confidence is high at ${pct(prediction.confidence)}.`);
  else neutral.push(`Confidence is ${pct(prediction.confidence)} and should not be treated as certainty.`);
  neutral.push('Model output is probabilistic and depends on the captured data snapshot.');
  if(prediction.risk==='LOW')neutral.push('Risk policy currently classifies this selection as LOW.');
  else opposing.push(`Risk policy classifies this selection as ${prediction.risk}.`);
  return {headline:`Model estimates ${pct(prediction.probability)} probability at odds ${prediction.marketOdds.toFixed(2)}.`,supporting,neutral,opposing,risk:prediction.risk};
}
export function buildModelTournament(records:PredictionRecord[], minimumSample=20):TournamentEntry[] {
  const grouped=new Map<string,PredictionRecord[]>();
  for(const record of records){const list=grouped.get(record.modelVersion)??[];list.push(record);grouped.set(record.modelVersion,list);}
  const entries=[...grouped.entries()].map(([modelVersion,items])=>{
    const summary=summarizeLearning(items); const eligible=summary.settled>=minimumSample;
    return {modelVersion,sampleSize:items.length,settled:summary.settled,wins:summary.wins,losses:summary.losses,hitRate:summary.hitRate,brierScore:summary.brierScore,simulatedRoi:summary.simulatedRoi,calibration:summary.calibration,eligible,rank:null as number|null};
  });
  const ranked=entries.filter(e=>e.eligible).sort((a,b)=>(b.simulatedRoi-a.simulatedRoi)||(a.brierScore-b.brierScore)||(b.calibration-a.calibration));
  const rankMap=new Map(ranked.map((e,i)=>[e.modelVersion,i+1]));
  return entries.map(e=>({...e,rank:rankMap.get(e.modelVersion)??null})).sort((a,b)=>(a.rank??999)-(b.rank??999)||b.settled-a.settled);
}
