export interface ClosingLineInput { takenOdds:number; closingOdds:number; referenceSource:string; capturedAt:string; }
export interface ClosingLineBenchmark { clvPct:number; beatClose:boolean; referenceSource:string; }

export function benchmarkClosingLine(input:ClosingLineInput):ClosingLineBenchmark{
  if(input.takenOdds<=1||input.closingOdds<=1)throw new Error('CLOSING_LINE_ODDS_INVALID');
  if(!input.referenceSource)throw new Error('CLOSING_LINE_SOURCE_REQUIRED');
  if(Number.isNaN(Date.parse(input.capturedAt)))throw new Error('CLOSING_LINE_TIMESTAMP_INVALID');
  const clvPct=(1/input.closingOdds-1/input.takenOdds)*100;
  return {clvPct,beatClose:clvPct>0,referenceSource:input.referenceSource};
}
