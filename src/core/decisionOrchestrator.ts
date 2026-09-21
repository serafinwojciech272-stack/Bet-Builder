import type { Selection } from '../domain/types.js';
import type { EventResearch } from '../research/types.js';
import { evaluateDecisionCenter, type DecisionCenterResult } from './decisionCenter.js';
import { evaluateControlPlane, type PortfolioControl } from './controlPlane.js';
import { buildResearchEvidence, type ResearchEvidence } from './researchEvidenceEngine.js';

export type OrchestratorStage='INGESTED'|'RESEARCHED'|'CONTROLLED'|'ANALYZED'|'PACKET_READY'|'MISSION_READY'|'REVIEW_REQUIRED'|'BLOCKED';
export interface DecisionOrchestratorResult {
  version:'1.0'; stage:OrchestratorStage; selections:Selection[]; research:EventResearch|null; researchByEventId:Record<string,EventResearch>; evidence:ResearchEvidence|null; evidenceByEventId:Record<string,ResearchEvidence>;
  control:PortfolioControl; decision:DecisionCenterResult; missionReady:boolean; packetEligible:boolean;
  recommendedAction:{kind:string;reason:string}|null; blockers:string[]; reviewFlags:string[]; auditTrail:string[]; fingerprint:string;
}
const hash=(s:string)=>{let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return(h>>>0).toString(16);};

export function orchestrateDecision(selections:Selection[],research:EventResearch|null|Record<string,EventResearch>=null):DecisionOrchestratorResult{
  const decision=evaluateDecisionCenter(selections);
  const researchByEventId:Record<string,EventResearch> = research ? ('eventId' in research ? {[research.eventId]:research as EventResearch} : research as Record<string,EventResearch>) : {};
  const evidenceByEventId:Record<string,ResearchEvidence> = Object.fromEntries(Object.entries(researchByEventId).map(([eventId,item])=>[eventId,buildResearchEvidence(item)]));
  const evidence=Object.values(evidenceByEventId)[0]??null;
  const control=evaluateControlPlane(selections,decision,researchByEventId);
  const blockers=[...control.hardStops];
  const reviewFlags=[...control.reviewFlags];
  const packetEligible=blockers.length===0&&control.researchGate.ready;
  const missionReady=packetEligible&&control.decision==='PROCEED_TO_ANALYSIS';
  let stage:OrchestratorStage='INGESTED';
  if(!selections.length)stage='BLOCKED';
  else if(!research)stage='REVIEW_REQUIRED';
  else if(control.decision==='BLOCK')stage='BLOCKED';
  else if(control.decision==='REVIEW_REQUIRED')stage='REVIEW_REQUIRED';
  else stage=missionReady?'MISSION_READY':'ANALYZED';
  const top=control.opportunitySignals[0];
  const recommendedAction=top?{kind:missionReady?(control.reviewFlags.includes('HIGH_DEPENDENCY')?'CORRELATION_GUARD':control.reviewFlags.includes('NEGATIVE_MODEL_EV')?'VALUE_CONFIRMATION':'REASSESS_ON_MOVEMENT'):'DATA_QUALITY_WATCH',reason:top.reasons.join('; ')||'Monitor the highest-ranked opportunity signal.'}:null;
  const auditTrail=[...control.auditTrail,...(evidence?.auditTrail??[])];
  auditTrail.push(`Orchestrator stage: ${stage}.`,`Packet eligibility: ${packetEligible?'YES':'NO'}; mission readiness: ${missionReady?'YES':'NO'}.`);
  const fingerprint=hash(JSON.stringify({version:'1.0',selectionIds:selections.map(s=>s.id),researchDigests:Object.fromEntries(Object.entries(researchByEventId).map(([eventId,item])=>[eventId,item.digest])),decision:{status:decision.status,ev:decision.ev,confidence:decision.confidence,marketQuality:decision.marketQuality.score},control:control.decision}));
  return {version:'1.0',stage,selections,research:Object.values(researchByEventId)[0]??null,researchByEventId,evidence,evidenceByEventId,control,decision,missionReady,packetEligible,recommendedAction,blockers,reviewFlags,auditTrail,fingerprint};
}

export function assertOrchestratorReady(result:DecisionOrchestratorResult):void{
  if(result.stage==='BLOCKED'||result.blockers.length)throw new Error('ORCHESTRATOR_BLOCKED: '+result.blockers.join('; '));
  if(result.stage==='REVIEW_REQUIRED'||result.reviewFlags.length)throw new Error('ORCHESTRATOR_REVIEW_REQUIRED: '+result.reviewFlags.join('; '));
  if(!result.packetEligible||!result.missionReady)throw new Error('ORCHESTRATOR_NOT_READY');
}

export function summarizeOrchestrator(result:DecisionOrchestratorResult):string[]{
  return [`Stage: ${result.stage}`,`Market quality: ${result.decision.marketQuality.grade} / ${(result.decision.marketQuality.score*100).toFixed(0)}%`,`Research: ${result.evidence?(result.evidence.quality*100).toFixed(0)+'%':'NOT RUN'}`,`EV: ${(result.decision.ev*100).toFixed(1)}%`,`Confidence: ${(result.decision.confidence*100).toFixed(0)}%`,`Packet: ${result.packetEligible?'READY':'BLOCKED'}`,`Mission: ${result.missionReady?'READY':'NOT READY'}`,`Fingerprint: ${result.fingerprint}`];
}
