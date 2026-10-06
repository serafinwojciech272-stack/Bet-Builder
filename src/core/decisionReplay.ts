export interface ReplayEvent { sequence:number; stage:string; timestamp:string; payloadHash:string; }
export interface ReplayResult { valid:boolean; stages:string[]; violations:string[]; }
export function replayDecision(events:ReplayEvent[]):ReplayResult {
 const violations:string[]=[]; const sorted=[...events].sort((a,b)=>a.sequence-b.sequence);
 sorted.forEach((e,i)=>{if(e.sequence!==i+1)violations.push('SEQUENCE_GAP');if(Number.isNaN(Date.parse(e.timestamp)))violations.push('INVALID_TIMESTAMP');if(!e.payloadHash)violations.push('MISSING_PAYLOAD_HASH');});
 return {valid:violations.length===0,stages:sorted.map(e=>e.stage),violations:[...new Set(violations)]};
}