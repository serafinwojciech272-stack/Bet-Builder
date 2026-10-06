export interface EvidenceNode { id:string; kind:'DATA'|'MODEL'|'MARKET'|'POLICY'|'OUTCOME'; ref:string; verified:boolean; }
export interface EvidenceLink { from:string; to:string; relation:'SUPPORTS'|'CONTRADICTS'|'DERIVED_FROM'; }
export interface EvidenceGraph { nodes:EvidenceNode[]; links:EvidenceLink[]; }
export function buildEvidenceGraph(nodes:EvidenceNode[],links:EvidenceLink[]):EvidenceGraph {
 const ids=new Set(nodes.map(n=>n.id)); if(nodes.some(n=>!n.id||!n.ref)||links.some(l=>!ids.has(l.from)||!ids.has(l.to))) throw new Error('EVIDENCE_GRAPH_INVALID');
 return {nodes:[...nodes],links:[...links]};
}