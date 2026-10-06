export interface ReferenceMarketInput {
  provider:string;
  capturedAt:string;
  eventStartAt:string;
  sourceCount:number;
  expectedSourceCount:number;
  complete:boolean;
  oddsValid:boolean;
  providerWeight?:number;
}

export interface ReferenceMarketQuality {
  score:number;
  grade:'A'|'B'|'C'|'D';
  eligible:boolean;
  freshness:number;
  coverage:number;
  depth:number;
  integrity:number;
  reasons:string[];
}

const clamp=(x:number)=>Math.max(0,Math.min(1,x));

export function evaluateReferenceMarket(input:ReferenceMarketInput, now=input.capturedAt):ReferenceMarketQuality {
  if(!input.provider) throw new Error('REFERENCE_PROVIDER_REQUIRED');
  const captured=Date.parse(input.capturedAt),start=Date.parse(input.eventStartAt),current=Date.parse(now);
  if([captured,start,current].some(Number.isNaN)) throw new Error('REFERENCE_TIMESTAMP_INVALID');
  if(captured>start) throw new Error('REFERENCE_CAPTURE_AFTER_EVENT');
  const seconds=Math.max(0,(start-captured)/1000);
  const freshness=clamp(1-seconds/(24*60*60));
  const coverage=clamp(input.expectedSourceCount>0?input.sourceCount/input.expectedSourceCount:0);
  const depth=clamp(input.sourceCount/5);
  const integrity=input.complete&&input.oddsValid?1:.35;
  const provider=clamp(input.providerWeight??1);
  const score=.30*freshness+.25*coverage+.15*depth+.25*integrity+.05*provider;
  const grade=score>=.85?'A':score>=.7?'B':score>=.5?'C':'D';
  const reasons:string[]=[];
  if(freshness<.5) reasons.push('REFERENCE_STALE');
  if(coverage<.8) reasons.push('SOURCE_COVERAGE_LOW');
  if(depth<.6) reasons.push('BOOKMAKER_DEPTH_LOW');
  if(!input.complete) reasons.push('MARKET_INCOMPLETE');
  if(!input.oddsValid) reasons.push('PRICE_INTEGRITY_FAILED');
  return {score,grade,eligible:grade==='A'||grade==='B',freshness,coverage,depth,integrity,reasons};
}
