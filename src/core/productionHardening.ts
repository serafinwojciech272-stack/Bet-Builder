import {M45_M100,missingStageEvidence} from './monetizationStages';
export type GateStatus='PASS'|'FAIL';
export interface HardeningEvidence { stageId:string; evidence:string; verifiedAt:string; verifier:string; }
export interface ProductionReadiness { status:GateStatus; stageCount:number; verifiedStageCount:number; missingStageIds:string[]; blockers:string[]; releaseCandidate:boolean; }
export function validateHardeningEvidence(evidence:HardeningEvidence[]):ProductionReadiness {
 const valid=evidence.filter(e=>M45_M100.some(s=>s.id===e.stageId)&&e.evidence.trim()&&e.verifiedAt&&e.verifier.trim());
 const map:Record<string,string[]>={}; for(const e of valid)(map[e.stageId]??=[]).push(e.evidence);
 const missing=missingStageEvidence(map); const duplicateKeys=new Set(valid.map(e=>e.stageId+':'+e.evidence)).size!==valid.length;
 const blockers=[...(duplicateKeys?['DUPLICATE_EVIDENCE']:[]),...(missing.length?['MISSING_STAGE_EVIDENCE']:[])];
 return {status:blockers.length?'FAIL':'PASS',stageCount:M45_M100.length,verifiedStageCount:M45_M100.filter(s=>!missing.includes(s.id)).length,missingStageIds:missing,blockers,releaseCandidate:!blockers.length};
}
export function assertReleaseCandidate(result:ProductionReadiness){if(!result.releaseCandidate)throw new Error('M100_RELEASE_GATE_BLOCKED:'+result.blockers.join(','));return true;}
