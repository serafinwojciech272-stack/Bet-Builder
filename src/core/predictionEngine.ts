import type { Selection, EventWithMarkets } from '../domain/types';
import {buildEnsemble,type ModelVote} from './ensembleEngine';
import {deriveProbability} from './probabilityEngine';
import {evaluateConfidence} from './confidenceEngine';
import {calculateEdge} from './edgeEngine';
import {analyzeLineMovement,type OddsPoint} from './lineMovement';
import {benchmarkClosingLine} from './closingLineBenchmark';
import {explainPrediction,type PredictionExplanation} from './predictionExplanation';

export interface Prediction {
  selectionId:string; eventId:string; marketId:string; label:string; probability:number; confidence:number;
  fairOdds:number; marketOdds:number; edge:number; ev:number; risk:Selection['risk']; modelVersion:string; reasons:string[];
}

export interface PredictionIntelligenceContext {
  modelVotes?:ModelVote[];
  evidenceQuality?:number;
  dataFreshness?:number;
  sampleSize?:number;
  calibrationFactor?:number;
  oddsHistory?:OddsPoint[];
  closingOdds?:number;
  closingReferenceSource?:string;
  closingReferenceTimestamp?:string;
}

export interface PredictionIntelligence {
  ensembleProbability:number;
  modelAgreement:number;
  ensembleMode:'SINGLE_MODEL_FALLBACK'|'MULTI_MODEL';
  confidenceScore:number;
  confidenceBand:'LOW'|'MEDIUM'|'HIGH'|'VERY_HIGH';
  confidenceReasons:string[];
  edgePct:number;
  expectedValue:number;
  fairOdds:number;
  lineMovement?:ReturnType<typeof analyzeLineMovement>;
  closingLine?:ReturnType<typeof benchmarkClosingLine>;
  explanation:PredictionExplanation;
}

const clamp=(v:number)=>Math.max(0,Math.min(.98,Number.isFinite(v)?v:0));

export function predictSelection(s:Selection):Prediction {
  const probability=clamp(s.probability);
  return {
    selectionId:s.id,eventId:s.eventId,marketId:s.marketId,label:s.shortName,probability,
    confidence:s.confidence,fairOdds:probability>0?1/probability:99,marketOdds:s.odds,
    edge:probability-s.impliedProbability,ev:probability*s.odds-1,risk:s.risk,
    modelVersion:'core-sports-v1',reasons:['market-implied baseline','multi-book consensus','risk-adjusted confidence']
  };
}

export function enrichPrediction(prediction:Prediction, context:PredictionIntelligenceContext={}):PredictionIntelligence {
  if(!(prediction.marketOdds>1)) throw new Error('PREDICTION_ODDS_INVALID');
  const multiModel=Boolean(context.modelVotes?.length && context.modelVotes.length>1);
  const votes=context.modelVotes?.length?context.modelVotes:[{modelVersion:prediction.modelVersion,probability:prediction.probability,weight:1}];
  const ensemble=buildEnsemble(votes);
  const probability=deriveProbability({
    modelProbability:ensemble.probability,
    marketProbability:1/prediction.marketOdds,
    evidenceWeight:context.evidenceQuality??1,
    calibrationFactor:context.calibrationFactor
  });
  const confidence=evaluateConfidence({
    probability:probability.probability,
    evidenceQuality:context.evidenceQuality??1,
    dataFreshness:context.dataFreshness??1,
    modelAgreement:ensemble.agreement,
    sampleSize:context.sampleSize??0
  });
  const edge=calculateEdge({probability:probability.probability,odds:prediction.marketOdds,marketProbability:probability.impliedProbability});
  const explanation=explainPrediction({
    probability:probability.probability,
    impliedProbability:probability.impliedProbability,
    edgePct:edge.edgePct,
    confidence:confidence.band,
    risk:prediction.risk,
    factors:[{id:'ensemble',direction:ensemble.agreement>=.75?'SUPPORTING':'NEUTRAL',label:'Model agreement',weight:ensemble.agreement}],
  });
  return {
    ensembleProbability:probability.probability,modelAgreement:ensemble.agreement,ensembleMode:multiModel?'MULTI_MODEL':'SINGLE_MODEL_FALLBACK',confidenceScore:confidence.score,confidenceBand:confidence.band,
    confidenceReasons:confidence.reasons,edgePct:edge.edgePct,expectedValue:edge.expectedValue,fairOdds:edge.fairOdds,
    lineMovement:context.oddsHistory?.length?analyzeLineMovement(context.oddsHistory):undefined,
    closingLine:context.closingOdds&&context.closingReferenceSource&&context.closingReferenceTimestamp
      ?benchmarkClosingLine({takenOdds:prediction.marketOdds,closingOdds:context.closingOdds,referenceSource:context.closingReferenceSource,capturedAt:context.closingReferenceTimestamp})
      :undefined,
    explanation
  };
}

export function rankPredictions(events:EventWithMarkets[]):Prediction[] {
  return events.flatMap(e=>e.markets.flatMap(m=>m.selections.map(predictSelection)))
    .filter(p=>p.ev>0&&p.risk!=='CRITICAL')
    .sort((a,b)=>(b.ev*.45+b.confidence*.35+b.edge*.2)-(a.ev*.45+a.confidence*.35+a.edge*.2));
}