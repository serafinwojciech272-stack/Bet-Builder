export interface PortfolioPosition { id:string; eventId:string; marketId:string; selectionId:string; value:number; correlationGroup?:string; }
export interface CorrelationPair { left:string; right:string; coefficient:number; reason:'SAME_EVENT'|'SAME_GROUP'|'INDEPENDENT'; }
export function buildPortfolioCorrelation(positions:PortfolioPosition[]):CorrelationPair[]{
 const out:CorrelationPair[]=[];
 for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++){const a=positions[i],b=positions[j];const sameEvent=a.eventId===b.eventId,sameGroup=!!a.correlationGroup&&a.correlationGroup===b.correlationGroup;out.push({left:a.id,right:b.id,coefficient:sameEvent?1:sameGroup?.6:0,reason:sameEvent?'SAME_EVENT':sameGroup?'SAME_GROUP':'INDEPENDENT'});}
 return out;
}