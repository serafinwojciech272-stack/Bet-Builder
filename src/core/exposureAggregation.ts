export interface ExposurePosition { id:string; eventId:string; marketId:string; stake:number; maxLoss:number; correlationGroup?:string; }
export interface ExposureBucket { key:string; stake:number; maxLoss:number; positionIds:string[]; concentrationPct:number; }
export interface ExposureReport { totalStake:number; totalMaxLoss:number; buckets:ExposureBucket[]; }
export function aggregateExposure(positions:ExposurePosition[],keyBy:'EVENT'|'MARKET'|'GROUP'='EVENT'):ExposureReport{
 const totalStake=positions.reduce((s,p)=>s+p.stake,0),totalMaxLoss=positions.reduce((s,p)=>s+p.maxLoss,0);
 const map=new Map<string,ExposureBucket>();
 for(const p of positions){const key=keyBy==='EVENT'?p.eventId:keyBy==='MARKET'?p.marketId:(p.correlationGroup??'UNGROUPED');const b=map.get(key)??{key,stake:0,maxLoss:0,positionIds:[],concentrationPct:0};b.stake+=p.stake;b.maxLoss+=p.maxLoss;b.positionIds.push(p.id);map.set(key,b);}
 const buckets=[...map.values()].map(b=>({...b,concentrationPct:totalStake?b.stake/totalStake:0})).sort((a,b)=>b.stake-a.stake);
 return {totalStake,totalMaxLoss,buckets};
}