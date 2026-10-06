export type DevigMethod='PROPORTIONAL'|'ADDITIVE';

export interface MarketPrice { selectionId:string; odds:number; }
export interface FairMarketPrice { selectionId:string; odds:number; impliedProbability:number; fairProbability:number; }
export interface DevigResult {
  method:DevigMethod;
  overround:number;
  totalImpliedProbability:number;
  prices:FairMarketPrice[];
}

const valid=(x:MarketPrice)=>Number.isFinite(x.odds)&&x.odds>1;

export function devigMarket(prices:MarketPrice[],method:DevigMethod='PROPORTIONAL'):DevigResult {
  if(prices.length<2) throw new Error('DEVIG_MARKET_REQUIRES_TWO_OUTCOMES');
  if(prices.some(p=>!p.selectionId||!valid(p))) throw new Error('DEVIG_PRICE_INVALID');
  const implied=prices.map(p=>1/p.odds);
  const total=implied.reduce((a,b)=>a+b,0);
  if(total<=1) throw new Error('DEVIG_NO_OVERROUND');
  const fair=method==='PROPORTIONAL'
    ? implied.map(p=>p/total)
    : (()=>{ const excess=total-1; const n=implied.length; return implied.map(p=>Math.max(0,p-excess/n)); })();
  const fairTotal=fair.reduce((a,b)=>a+b,0);
  const normalized=fair.map(p=>p/fairTotal);
  return {
    method,overround:total-1,totalImpliedProbability:total,
    prices:prices.map((p,i)=>({selectionId:p.selectionId,odds:1/normalized[i],impliedProbability:implied[i],fairProbability:normalized[i]}))
  };
}
