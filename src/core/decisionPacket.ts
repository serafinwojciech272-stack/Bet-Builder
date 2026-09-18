import type { OptimizationResult, DecisionGateInput } from './types';
import type { DecisionCenterResult } from './decisionCenter';
import type { EventResearch } from '../research/types';
import type { ResearchEvidence } from './researchEvidenceEngine';

export interface DecisionPacketSelection { id:string; eventId:string; marketId?:string; odds:number; probability:number; confidence:number; risk:string; correlationGroup:string; }
export interface DecisionPacket {
  id:string; version:'1.0'; createdAt:string; status:DecisionGateInput['status']; blockers:string[]; warnings:string[]; trace:string[];
  source:{selectionIds:string[];combinedOdds:number;baseProbability:number;adjustedProbability:number;ev:number;confidence:number;quality:number;marketQuality:DecisionCenterResult['marketQuality'];dependencyMultiplier:number;correlationRisk:number;concentrationRisk:number;};
  selections:DecisionPacketSelection[]; coreOptimization:OptimizationResult|null; research:EventResearch|null; researchEvidence:ResearchEvidence|null; mission:{eligible:boolean;reason:string};
}

export function createDecisionPacket(decision:DecisionCenterResult,selections:DecisionPacketSelection[],optimization:OptimizationResult|null=null,now=new Date(),research:EventResearch|null=null,researchEvidence:ResearchEvidence|null=null):DecisionPacket{
  const status=decision.status, blockers=[...decision.blockers], warnings=[...decision.warnings], trace=[...decision.trace];
  if(optimization)trace.push('Core Engine optimization: '+optimization.selections.length+' selected, '+optimization.rejectedSelections.length+' rejected.');
  if(research){trace.push('Deep research: '+research.sources.length+' sources, '+research.findings.length+' findings, quality '+(research.researchQuality*100).toFixed(0)+'%.');trace.push('Research consensus: '+research.consensus.direction+'; lineup status: '+research.lineupStatus+'.');}
  if(researchEvidence){trace.push('Evidence Engine: '+(researchEvidence.quality*100).toFixed(0)+'% quality, '+researchEvidence.evidence.length+' evidence item(s), '+researchEvidence.conflicts.length+' conflict(s).');trace.push('Evidence digest: '+researchEvidence.digest+'.');}
  trace.push('Decision Packet status: '+status+'.');
  return {
    id:'DP-'+now.getTime()+'-'+selections.map(s=>s.id).join('-').slice(0,48),version:'1.0',createdAt:now.toISOString(),status,blockers,warnings,trace,
    source:{selectionIds:selections.map(s=>s.id),combinedOdds:decision.combinedOdds,baseProbability:decision.baseProbability,adjustedProbability:decision.adjustedProbability,ev:decision.ev,confidence:decision.confidence,quality:decision.quality,marketQuality:decision.marketQuality,dependencyMultiplier:decision.dependencyMultiplier,correlationRisk:decision.correlationRisk,concentrationRisk:decision.concentrationRisk},
    selections,coreOptimization:optimization,research,researchEvidence,mission:{eligible:status!=='BLOCKED'&&(!research||research.researchQuality>=.5),reason:status==='BLOCKED'?'Blocked by Decision Center: '+blockers.join('; '):research&&research.researchQuality<.5?'Deep research quality below mission threshold.':status==='CAUTION'?'Mission eligible with '+warnings.length+' Decision Center warning(s) preserved.':'Decision Center READY — mission may enter the existing approval pipeline.'}
  };
}
export function assertMissionEligible(packet:DecisionPacket):void{if(!packet.mission.eligible||packet.status==='BLOCKED')throw new Error('DECISION_PACKET_BLOCKED: '+(packet.blockers.join('; ')||'Decision Packet is blocked.'));}

import type { AnalysisResponse } from '../ai/contracts';
import { evaluateDecisionCenter } from './decisionCenter';
export function createDecisionPacketFromAnalysis(analysis:AnalysisResponse,now=new Date(),selectionIds?:string[]):DecisionPacket{
  const candidateSource=analysis.quantDecision?.candidates??analysis.valueSignals.map(signal=>({id:signal.selectionId,eventId:analysis.eventId,marketId:analysis.context.market,odds:signal.bestPrice.value,probability:analysis.probabilityEstimates.find(p=>p.selectionId===signal.selectionId)?.modelProbability.value??0,qualityScore:analysis.dataQuality.score.value,correlationGroup:'event:'+analysis.eventId}));
  const candidates=selectionIds?.length?candidateSource.filter(candidate=>selectionIds.includes(candidate.id)):candidateSource;
  const marketSignals=analysis.quantDecision?.marketSignals??[];
  const selections=candidates.map((candidate):DecisionPacketSelection=>({id:candidate.id,eventId:candidate.eventId,marketId:candidate.marketId,odds:candidate.odds,probability:candidate.probability,confidence:marketSignals.find(s=>s.selectionId===candidate.id)?.confidence??analysis.confidence.score.value,risk:analysis.riskAssessment.level,correlationGroup:candidate.correlationGroup??('event:'+analysis.eventId)}));
  const decision=evaluateDecisionCenter(selections.map(s=>({id:s.id,marketId:s.marketId??analysis.context.market,eventId:s.eventId,name:s.id,shortName:s.id,odds:s.odds,probability:s.probability,impliedProbability:1/s.odds,value:s.probability-1/s.odds,ev:s.probability*s.odds-1,confidence:s.confidence,risk:s.risk as 'LOW'|'MEDIUM'|'HIGH'|'CRITICAL',correlationGroup:s.correlationGroup})));
  const q=analysis.quantDecision?.coreOptimization;
  const optimization=q?{selections:[...q.selected],rejectedSelections:[...q.rejected],rejectedReasons:Object.fromEntries(q.rejected.map(id=>[id,'Rejected by quant decision engine.'])),stake:0,combinedOdds:q.combinedOdds,estimatedProbability:q.estimatedProbability,estimatedEv:q.estimatedEv,potentialReturn:0,potentialProfit:0,diversificationScore:q.diversificationScore,rationale:q.rationale}:null;
  return createDecisionPacket(decision,selections,optimization,now,null);
}