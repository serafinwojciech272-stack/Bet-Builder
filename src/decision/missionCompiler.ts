import type { DecisionCenterResult } from '../core/decisionCenter';
import type { EvidenceGraph } from './evidenceGraph';
import type { AIReasoningResult } from './aiReasoning';

export interface MissionPlan { version:'1.0'; eligible:boolean; status:'READY'|'REVIEW'|'BLOCKED'; objective:string; preconditions:string[]; actions:Array<{id:string;kind:string;description:string}>; measurement:string[]; learning:string[]; evidenceDigest:string; }
export function compileMission(decision:DecisionCenterResult,graph:EvidenceGraph,reasoning:AIReasoningResult):MissionPlan{
 const blocked=decision.blockers.length>0||decision.status==='BLOCKED';
 const review=!blocked&&(decision.status==='CAUTION'||reasoning.model.degraded||graph.conflicts>0);
 const eligible=!blocked;
 const objective=eligible?'Execute only the approved decision under the current evidence snapshot.':'Resolve decision blockers before any mission can be created.';
 const actions=eligible?[{id:'human-approval',kind:'APPROVAL_GATE',description:'Require explicit human approval before execution.'},{id:'execute-governed',kind:'CORE_ENGINE',description:'Execute only the approved action through the existing Core Engine pipeline.'}]:[];
 return {version:'1.0',eligible,status:blocked?'BLOCKED':review?'REVIEW':'READY',objective,preconditions:[...decision.blockers,...decision.warnings,'Evidence graph must remain traceable to its source snapshot.'],actions,measurement:['Record execution outcome and decision-state transition.','Compare measured outcome against the decision baseline.'],learning:['Persist outcome as a learning event.','Re-evaluate model confidence from measured evidence.'],evidenceDigest:graph.digest};
}
