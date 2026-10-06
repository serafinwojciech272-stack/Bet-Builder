export interface EvidenceItem { id:string; source:string; timestamp:string; confidence:number; fresh:boolean; kind:'LIVE'|'MODEL'|'HISTORICAL'|'HUMAN'; }
export interface EvidenceQualityResult { score:number; freshRatio:number; sourceCount:number; conflicts:number; status:'VERIFIED'|'REVIEW'|'BLOCKED'; }
const clamp=(v:number)=>Math.max(0,Math.min(1,Number.isFinite(v)?v:0));
export function scoreEvidence(items:EvidenceItem[]):EvidenceQualityResult {
 if(!items.length)return {score:0,freshRatio:0,sourceCount:0,conflicts:0,status:'BLOCKED'};
 const freshRatio=items.filter(x=>x.fresh).length/items.length;
 const confidence=items.reduce((s,x)=>s+clamp(x.confidence>1?x.confidence/100:x.confidence),0)/items.length;
 const sourceCount=new Set(items.map(x=>x.source.trim()).filter(Boolean)).size;
 const conflicts=new Set(items.filter(x=>x.kind==='LIVE').map(x=>x.id)).size<items.filter(x=>x.kind==='LIVE').length?1:0;
 const score=clamp(confidence*.55+freshRatio*.3+Math.min(1,sourceCount/3)*.15);
 return {score,freshRatio,sourceCount,conflicts,status:conflicts>0?'REVIEW':score>=.75?'VERIFIED':score>=.5?'REVIEW':'BLOCKED'};
}
