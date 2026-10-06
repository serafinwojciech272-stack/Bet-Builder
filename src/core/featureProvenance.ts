export interface ProvenanceNode { id:string; type:'SOURCE'|'FEATURE'|'MODEL'|'PREDICTION'; ref:string; }
export interface ProvenanceEdge { from:string; to:string; relation:'DERIVED_FROM'|'USED_BY'|'PRODUCED'; }
export interface FeatureProvenanceGraph { nodes:ProvenanceNode[]; edges:ProvenanceEdge[]; }
export function buildFeatureProvenanceGraph(nodes:ProvenanceNode[],edges:ProvenanceEdge[]):FeatureProvenanceGraph {
 const ids=new Set(nodes.map(n=>n.id)); if(nodes.some(n=>!n.id||!n.ref)||edges.some(e=>!ids.has(e.from)||!ids.has(e.to))) throw new Error('PROVENANCE_GRAPH_INVALID');
 return {nodes:[...nodes],edges:[...edges]};
}