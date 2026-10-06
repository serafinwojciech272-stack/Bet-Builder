export interface BacktestRecord {
  id:string;
  eventStartAt:string;
  observedAt:string;
  label:number;
  featuresAvailableAt:string;
}

export interface WalkForwardWindow { trainEndAt:string; testStartAt:string; testEndAt:string; trainCount:number; testCount:number; }
export interface WalkForwardResult { windows:WalkForwardWindow[]; tested:number; leakageFree:boolean; violations:string[]; }

const ts=(v:string)=>Date.parse(v);

export function runWalkForwardBacktest(
  records:BacktestRecord[],
  trainSize:number,
  testSize:number,
  stepSize=testSize
):WalkForwardResult {
  if(trainSize<1||testSize<1||stepSize<1) throw new Error('WALK_FORWARD_WINDOW_INVALID');
  const sorted=[...records].sort((a,b)=>ts(a.eventStartAt)-ts(b.eventStartAt));
  const violations:string[]=[];
  for(const r of sorted){
    if([r.eventStartAt,r.observedAt,r.featuresAvailableAt].some(v=>Number.isNaN(ts(v)))) violations.push(`INVALID_TIMESTAMP:${r.id}`);
    const event=ts(r.eventStartAt), observed=ts(r.observedAt), available=ts(r.featuresAvailableAt);
    if(observed>event||available>event) violations.push(`FUTURE_DATA:${r.id}`);
  }
  const windows:WalkForwardWindow[]=[];
  for(let start=0;start+trainSize+testSize<=sorted.length;start+=stepSize){
    const train=sorted.slice(start,start+trainSize),test=sorted.slice(start+trainSize,start+trainSize+testSize);
    const trainEnd=ts(train.at(-1)!.eventStartAt),testStart=ts(test[0].eventStartAt);
    if(trainEnd>=testStart) violations.push(`WINDOW_OVERLAP:${test[0].id}`);
    const trainIds=new Set(train.map(r=>r.id));
    for(const r of test) if(trainIds.has(r.id)) violations.push(`RECORD_OVERLAP:${r.id}`);
    windows.push({trainEndAt:train.at(-1)!.eventStartAt,testStartAt:test[0].eventStartAt,testEndAt:test.at(-1)!.eventStartAt,trainCount:train.length,testCount:test.length});
  }
  return {windows,tested:windows.reduce((n,w)=>n+w.testCount,0),leakageFree:violations.length===0,violations};
}
