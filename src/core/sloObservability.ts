export type SLOStatus='HEALTHY'|'AT_RISK'|'BREACHED';
export interface SLOTarget { name:string; target:number; direction:'MIN'|'MAX'; }
export interface SLOMeasurement { name:string; value:number; }
export interface SLOResult { name:string; target:number; value:number; status:SLOStatus; }
export function evaluateSLOs(targets:SLOTarget[], measurements:SLOMeasurement[]):SLOResult[] {
 const map=new Map(measurements.map(x=>[x.name,x.value]));
 return targets.map(t=>{ const value=map.get(t.name); const ok=value!==undefined&&(t.direction==='MIN'?value>=t.target:value<=t.target); const margin=value===undefined?0:(t.direction==='MIN'?value-t.target:t.target-value); return {name:t.name,target:t.target,value:value??0,status:value===undefined||!ok?'BREACHED':margin/Math.max(Math.abs(t.target),1)<.01?'AT_RISK':'HEALTHY'}; });
}
export function sloGate(results:SLOResult[]):SLOStatus { if(results.some(x=>x.status==='BREACHED'))return 'BREACHED'; if(results.some(x=>x.status==='AT_RISK'))return 'AT_RISK'; return 'HEALTHY'; }
