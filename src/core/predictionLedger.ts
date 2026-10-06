import type {PredictionRecord,OutcomeStatus} from './outcomeLearning';
export interface PredictionSnapshot extends PredictionRecord {capturedOdds:number;capturedProbability:number;capturedAt:string;modelVersion:string;}
export interface OutcomeUpdate {id:string;outcome:Exclude<OutcomeStatus,'PENDING'>;settledAt:string;}
export function snapshotPrediction(input:Omit<PredictionSnapshot,'capturedOdds'|'capturedProbability'|'capturedAt'>&{odds:number;probability:number;capturedAt:string}):PredictionSnapshot{
 if(!input.id||!input.eventId||!input.modelVersion)throw new Error('PREDICTION_IDENTITY_REQUIRED');
 if(input.outcome!=='PENDING')throw new Error('PREDICTION_MUST_START_PENDING');
 if(!Number.isFinite(input.probability)||input.probability<=0||input.probability>=1)throw new Error('PREDICTION_PROBABILITY_INVALID');
 if(!Number.isFinite(input.odds)||input.odds<=1)throw new Error('PREDICTION_ODDS_INVALID');
 if(Number.isNaN(Date.parse(input.capturedAt)))throw new Error('PREDICTION_TIMESTAMP_INVALID');
 return {...input,capturedOdds:input.odds,capturedProbability:input.probability,outcome:'PENDING'};
}
export function settlePrediction(record:PredictionSnapshot,update:OutcomeUpdate):PredictionSnapshot{
 if(record.id!==update.id)throw new Error('OUTCOME_ID_MISMATCH');if(record.outcome!=='PENDING')throw new Error('OUTCOME_ALREADY_SETTLED');if(!update.settledAt||Number.isNaN(Date.parse(update.settledAt)))throw new Error('SETTLED_AT_INVALID');
 return {...record,outcome:update.outcome,settledAt:update.settledAt};
}