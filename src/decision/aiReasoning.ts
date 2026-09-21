import type { DecisionCenterResult } from '../core/decisionCenter';
import type { EvidenceGraph } from './evidenceGraph';
import { deterministicReasoningAdapter, type DecisionModelRouter, type ModelResponse } from './modelRouter';

export interface AIReasoningResult { stance:'constructive'|'neutral'|'cautious'|'avoid'; synthesis:string; factors:string[]; uncertainties:string[]; model:ModelResponse; }
export async function runAIReasoning(router:DecisionModelRouter|undefined,decision:DecisionCenterResult,graph:EvidenceGraph):Promise<AIReasoningResult>{
 const context={status:decision.status,blockers:decision.blockers,warnings:decision.warnings,confidence:decision.confidence,quality:decision.quality,graphDigest:graph.digest,conflicts:graph.conflicts};
 const model=router?await router.run({task:'reason',input:'Produce a grounded decision synthesis from the supplied evidence graph.',context}):await deterministicReasoningAdapter.run({task:'reason',input:'',context});
 const stance=decision.status==='BLOCKED'?'avoid':decision.status==='CAUTION'?'cautious':'constructive';
 return {stance,synthesis:model.text,factors:[...decision.strengths,...decision.trace.slice(0,3)],uncertainties:[...decision.warnings,...decision.blockers],model};
}
