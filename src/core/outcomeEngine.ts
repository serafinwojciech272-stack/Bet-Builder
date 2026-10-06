import type { OutcomeStatus, PredictionRecord } from './outcomeLearning';

export interface OutcomeGrade {
  predictionId: string;
  outcome: Exclude<OutcomeStatus, 'PENDING'>;
  settledAt: string;
  brierScore: number | null;
  logLoss: number | null;
  clvPct: number | null;
  roi: number | null;
  confidenceAccurate: boolean | null;
  grade: 'WON' | 'LOST' | 'PUSH' | 'VOID';
}

const clampProbability=(p:number)=>Math.min(1-1e-9,Math.max(1e-9,p));

export function gradePrediction(
  record: PredictionRecord,
  outcome: Exclude<OutcomeStatus,'PENDING'>,
  settledAt: string,
  closingOdds?: number,
): OutcomeGrade {
  if(!record.id||!record.modelVersion) throw new Error('OUTCOME_IDENTITY_REQUIRED');
  if(Number.isNaN(Date.parse(settledAt))) throw new Error('SETTLED_AT_INVALID');
  if(!Number.isFinite(record.probability)||record.probability<0||record.probability>1) throw new Error('PREDICTION_PROBABILITY_INVALID');
  if(!Number.isFinite(record.odds)||record.odds<=1) throw new Error('PREDICTION_ODDS_INVALID');
  if(closingOdds!==undefined&&(!Number.isFinite(closingOdds)||closingOdds<=1)) throw new Error('CLOSING_ODDS_INVALID');

  const target=outcome==='WON'?1:outcome==='LOST'?0:null;
  const p=clampProbability(record.probability);
  const brierScore=target===null?null:(p-target)**2;
  const logLoss=target===null?null:-(target*Math.log(p)+(1-target)*Math.log(1-p));
  const clvPct=closingOdds===undefined?null:(1/closingOdds-1/record.odds)*100;
  const roi=outcome==='WON'?record.odds-1:outcome==='LOST'?-1:0;
  const confidenceAccurate=record.probability>=.7?outcome==='WON':record.probability<=.3?outcome==='LOST':null;
  return {predictionId:record.id,outcome,settledAt,brierScore,logLoss,clvPct,roi,confidenceAccurate,grade:outcome};
}

export function assertExactlyOnceSettlement(existing: PredictionRecord, outcome: Exclude<OutcomeStatus,'PENDING'>): void {
  if(existing.outcome!=='PENDING') throw new Error(`OUTCOME_ALREADY_SETTLED:${existing.id}:${outcome}`);
}
