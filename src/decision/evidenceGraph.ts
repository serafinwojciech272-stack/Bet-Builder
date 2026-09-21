import type { DecisionCenterResult } from '../core/decisionCenter';
import type { ResearchEvidence } from '../core/researchEvidenceEngine';

export type EvidenceNodeKind='source'|'signal'|'model'|'risk'|'decision'|'action';
export interface EvidenceNode { id:string; kind:EvidenceNodeKind; label:string; value?:number; confidence?:number; source:'deterministic'|'research'|'system'; }
export interface EvidenceEdge { from:string; to:string; relation:'supports'|'contradicts'|'informs'|'constrains'|'produces'; weight:number; }
export interface EvidenceGraph { version:'1.0'; nodes:EvidenceNode[]; edges:EvidenceEdge[]; digest:string; conflicts:number; coverage:number; }
const clamp=(n:number)=>Math.min(1,Math.max(0,n));
const digest=(value:string)=>{let h=2166136261;for(const c of value){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return(h>>>0).toString(16)};

export function buildEvidenceGraph(decision:DecisionCenterResult,researchEvidence:ResearchEvidence|null=null):EvidenceGraph{
 const nodes:EvidenceNode[]=[
  {id:'market',kind:'source',label:'Market data',value:decision.marketQuality.score,confidence:decision.marketQuality.confidence,source:'deterministic'},
  {id:'model',kind:'model',label:'Decision model',value:decision.quality,confidence:decision.confidence,source:'deterministic'},
  {id:'risk',kind:'risk',label:'Correlation / concentration risk',value:clamp(Math.max(decision.correlationRisk,decision.concentrationRisk)),source:'deterministic'},
  {id:'decision',kind:'decision',label:'Decision gate',confidence:decision.status==='READY'?1:decision.status==='CAUTION'?.6:0,source:'system'},
 ];
 const edges:EvidenceEdge[]=[
  {from:'market',to:'model',relation:'informs',weight:decision.marketQuality.score},
  {from:'model',to:'decision',relation:'supports',weight:decision.confidence},
  {from:'risk',to:'decision',relation:'constrains',weight:Math.max(decision.correlationRisk,decision.concentrationRisk)},
 ];
 if(researchEvidence){
  nodes.push({id:'research',kind:'source',label:'Research evidence',value:researchEvidence.quality,confidence:researchEvidence.quality,source:'research'});
  edges.push({from:'research',to:'model',relation:'informs',weight:researchEvidence.quality});
  researchEvidence.conflicts.forEach((conflict,index)=>{const id='conflict-'+index;nodes.push({id,kind:'risk',label:conflict.category+': '+conflict.adverse.slice(0,2).join(' | '),confidence:0,source:'research'});edges.push({from:id,to:'decision',relation:'constrains',weight:1});});
 }
 const conflicts=researchEvidence?.conflicts.length??0;
 const coverage=clamp(nodes.filter(n=>(n.confidence??n.value??0)>0).length/Math.max(1,nodes.length));
 return {version:'1.0',nodes,edges,digest:digest(JSON.stringify({nodes,edges})),conflicts,coverage};
}
