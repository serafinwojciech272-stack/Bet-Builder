import type { Prediction, PredictionIntelligence } from './predictionEngine';
import { classifyFreshness, riskFromDecision, decisionState, evidenceQuality, uncertaintyReason, riskFriction, mobileSummary, finalDecisionContract, type DecisionEvidence, type DecisionView, type ProductState, type RiskBand } from './productIntelligenceM146M165';

export interface CockpitTrustLayer {
  decision: DecisionView;
  freshness: 'FRESH'|'STALE'|'CRITICAL';
  uncertainty: string;
  friction: 'NONE'|'CONFIRM'|'COOLING_OFF';
  mobile: ReturnType<typeof mobileSummary>;
  contract: ReturnType<typeof finalDecisionContract>;
  approvalRequired: true;
  executionAllowed: false;
  auditReady: boolean;
}

function evidenceFor(prediction:Prediction, intelligence:PredictionIntelligence, sampleSize:number):DecisionEvidence[]{
  const now=new Date().toISOString();
  return [
    {id:'model',label:'Model probability',value:`${(intelligence.ensembleProbability*100).toFixed(1)}%`,source:prediction.modelVersion,updatedAt:now,quality:'A'},
    {id:'market',label:'Market price',value:prediction.marketOdds.toFixed(2),source:'market',updatedAt:now,quality:'A'},
    {id:'confidence',label:'Confidence',value:`${(intelligence.confidenceScore*100).toFixed(0)}%`,source:'confidence-engine',updatedAt:now,quality:sampleSize>=20?'A':'B'}
  ];
}

export function buildCockpitTrustLayer(prediction:Prediction,intelligence:PredictionIntelligence,sampleSize=0):CockpitTrustLayer{
  const freshness=classifyFreshness(0);
  const evidence=evidenceFor(prediction,intelligence,sampleSize);
  const eq=evidenceQuality(evidence);
  const risk=riskFromDecision(intelligence.confidenceScore,intelligence.edgePct/100,1-intelligence.modelAgreement);
  const state=decisionState({freshness,policy:risk==='CRITICAL'?'BLOCKED':risk==='HIGH'?'REVIEW':'CLEAR',provider:'NORMAL',hasEvidence:evidence.length>0});
  const decision:DecisionView={
    title:prediction.label,probability:intelligence.ensembleProbability,fairProbability:1/prediction.marketOdds,
    edge:intelligence.edgePct/100,confidence:intelligence.confidenceScore,risk,state,evidence,stale:false,
    explanation:`${prediction.label}: ${intelligence.explanation.headline}. Decision support, not a guarantee.`
  };
  return {
    decision,freshness,uncertainty:uncertaintyReason(intelligence.confidenceScore,sampleSize),
    friction:riskFriction(risk),mobile:mobileSummary(decision),contract:finalDecisionContract(decision),
    approvalRequired:true,executionAllowed:false,
    auditReady:!!prediction.selectionId&&evidence.length>0&&!!prediction.modelVersion
  };
}

export function trustLayerStatus(layer:CockpitTrustLayer):ProductState{return layer.decision.state;}
export function trustLayerEvidenceScore(layer:CockpitTrustLayer):number{return evidenceQuality(layer.decision.evidence);}
export function trustLayerSampleLabel(sampleSize:number):string{return sampleSize<20?'INSUFFICIENT SAMPLE':'SAMPLE QUALIFIED';}
