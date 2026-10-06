import {buildEnsemble,type ModelVote} from './ensembleEngine';
import {deriveProbability} from './probabilityEngine';
import {evaluateConfidence} from './confidenceEngine';
import {calculateEdge} from './edgeEngine';

export interface PredictionEngineInput {
  eventId:string; marketId:string; odds:number; modelVotes:ModelVote[];
  evidenceQuality:number; dataFreshness:number; sampleSize:number; calibrationFactor?:number;
}
export interface PredictionEngineOutput {
  eventId:string; marketId:string; probability:number; impliedProbability:number;
  edgePct:number; expectedValue:number; fairOdds:number; confidence:number;
  confidenceBand:'LOW'|'MEDIUM'|'HIGH'|'VERY_HIGH'; modelAgreement:number;
}

export function generatePrediction(input:PredictionEngineInput):PredictionEngineOutput{
  if(!input.eventId||!input.marketId)throw new Error('PREDICTION_CONTEXT_REQUIRED');
  const ensemble=buildEnsemble(input.modelVotes);
  const p=deriveProbability({modelProbability:ensemble.probability,marketProbability:1/input.odds,evidenceWeight:1,calibrationFactor:input.calibrationFactor});
  const confidence=evaluateConfidence({probability:p.probability,evidenceQuality:input.evidenceQuality,dataFreshness:input.dataFreshness,modelAgreement:ensemble.agreement,sampleSize:input.sampleSize});
  const edge=calculateEdge({probability:p.probability,odds:input.odds,marketProbability:p.impliedProbability});
  return {eventId:input.eventId,marketId:input.marketId,probability:p.probability,impliedProbability:p.impliedProbability,edgePct:edge.edgePct,expectedValue:edge.expectedValue,fairOdds:edge.fairOdds,confidence:confidence.score,confidenceBand:confidence.band,modelAgreement:ensemble.agreement};
}
