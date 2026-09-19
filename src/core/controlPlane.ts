import type { Selection } from '../domain/types';
import type { EventResearch } from '../research/types';
import type { DecisionCenterResult } from './decisionCenter';
import { evaluateDecisionCenter } from './decisionCenter';

export type ControlDecision = 'PROCEED_TO_ANALYSIS' | 'REVIEW_REQUIRED' | 'BLOCK';
export interface OpportunitySignal { selectionId:string; eventId:string; edge:number; ev:number; confidence:number; quality:number; signalScore:number; reasons:string[]; }
export interface PortfolioControl {
  decision:ControlDecision; hardStops:string[]; reviewFlags:string[]; opportunitySignals:OpportunitySignal[];
  counterfactual:{removeWorstSelectionId:string|null;evDelta:number;confidenceDelta:number;correlationDelta:number;interpretation:string};
  researchGate:{ready:boolean;quality:number;findings:number;sources:number;warnings:string[]};
  auditTrail:string[];
}
const clamp=(n:number)=>Math.max(0,Math.min(1,n));

export function evaluateControlPlane(selections:Selection[], decision:DecisionCenterResult=evaluateDecisionCenter(selections), research:EventResearch|null=null):PortfolioControl {
  const hardStops:string[]=[]; const reviewFlags:string[]=[];
  if(!selections.length) hardStops.push('EMPTY_PORTFOLIO');
  if(decision.blockers.length) hardStops.push(...decision.blockers.map(b=>`DECISION_CENTER: ${b}`));
  if(decision.marketQuality.grade==='D') reviewFlags.push('MARKET_QUALITY_D');
  if(decision.confidence<.6) reviewFlags.push('LOW_CONFIDENCE');
  if(decision.correlationRisk>=.2) reviewFlags.push('HIGH_DEPENDENCY');
  if(decision.concentrationRisk>=.67&&selections.length>1) reviewFlags.push('CONCENTRATION_RISK');
  if(decision.ev<0) reviewFlags.push('NEGATIVE_MODEL_EV');
  if(decision.marketQuality.freshness<0.5) reviewFlags.push('STALE_PRICE_INPUT');
  if(decision.marketQuality.freshness<0.25) hardStops.push('PRICE_FEED_TOO_STALE');
  const researchGate=research?{ready:research.researchQuality>=.5&&research.sources.length>=3,quality:research.researchQuality,findings:research.findings.length,sources:research.sources.length,warnings:research.warnings}: {ready:false,quality:0,findings:0,sources:0,warnings:['Deep research has not been completed.']};
  if(selections.length && !researchGate.ready) reviewFlags.push('RESEARCH_GATE_NOT_READY');
  if(research && research.lineupStatus==='unknown') reviewFlags.push('LINEUP_UNCERTAIN');
  if(research && research.consensus.direction==='mixed') reviewFlags.push('RESEARCH_CONTRADICTION');

  const opportunitySignals=selections.map(s=>{
    const edge=s.probability-s.impliedProbability, ev=s.probability*s.odds-1;
    const signalScore=clamp(edge*1.5+Math.max(0,ev)*.75+s.confidence*.35+s.value*.25);
    const reasons:string[]=[];
    if(edge>.03) reasons.push('positive model-to-implied probability gap');
    if(ev>0) reasons.push('positive model EV');
    if(s.confidence>=.7) reasons.push('high model confidence');
    if(s.risk==='HIGH'||s.risk==='CRITICAL') reasons.push('elevated selection risk');
    if(research?.consensus.direction==='supportive') reasons.push('research consensus supportive');
    if(research?.consensus.direction==='adverse') reasons.push('research consensus adverse');
    return {selectionId:s.id,eventId:s.eventId,edge,ev,confidence:s.confidence,quality:clamp(s.confidence-({LOW:0,MEDIUM:.12,HIGH:.25,CRITICAL:.4}[s.risk]??.15)+.25),signalScore,reasons};
  }).sort((a,b)=>b.signalScore-a.signalScore);

  let removeWorstSelectionId:string|null=null,evDelta=0,confidenceDelta=0,correlationDelta=0,interpretation='No counterfactual available.';
  if(selections.length>1){
    let worst:{id:string;score:number;result:DecisionCenterResult}|null=null;
    for(const s of selections){const result=evaluateDecisionCenter(selections.filter(x=>x.id!==s.id));const score=result.ev*.5+result.confidence*.3-result.correlationRisk*.2;if(!worst||score<worst.score)worst={id:s.id,score,result};}
    if(worst){removeWorstSelectionId=worst.id;evDelta=worst.result.ev-decision.ev;confidenceDelta=worst.result.confidence-decision.confidence;correlationDelta=worst.result.correlationRisk-decision.correlationRisk;interpretation=`Removing ${worst.id} changes EV by ${(evDelta*100).toFixed(1)}pp, confidence by ${(confidenceDelta*100).toFixed(1)}pp and correlation risk by ${(correlationDelta*100).toFixed(1)}pp.`;}
  }
  const controlDecision:ControlDecision=hardStops.length?'BLOCK':reviewFlags.length?'REVIEW_REQUIRED':'PROCEED_TO_ANALYSIS';
  return {decision:controlDecision,hardStops,reviewFlags,opportunitySignals,counterfactual:{removeWorstSelectionId,evDelta,confidenceDelta,correlationDelta,interpretation},researchGate,auditTrail:[
    `Control Plane evaluated ${selections.length} selection(s).`,`Decision Center status: ${decision.status}.`,`Market quality: ${decision.marketQuality.grade}.`,
    `Research gate: ${researchGate.ready?'READY':'REVIEW'} (${(researchGate.quality*100).toFixed(0)}%, ${researchGate.sources} sources).`,
    `Opportunity signals ranked: ${opportunitySignals.length}.`,removeWorstSelectionId?`Counterfactual removal tested: ${removeWorstSelectionId}.`:'Counterfactual removal skipped.',`Control decision: ${controlDecision}.`
  ]};
}