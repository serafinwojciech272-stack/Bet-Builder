import type { ModelPerformance } from './modelPerformance';

export interface PublicPerformanceRecord extends ModelPerformance {
  publishedAt:string;
  methodologyVersion:string;
  immutable:true;
}

export function createPublicPerformanceLedger(
  rows:ModelPerformance[],
  publishedAt:string,
  methodologyVersion:string,
):ReadonlyArray<PublicPerformanceRecord>{
  if(Number.isNaN(Date.parse(publishedAt))) throw new Error('PUBLIC_LEDGER_TIMESTAMP_INVALID');
  if(!methodologyVersion) throw new Error('PUBLIC_LEDGER_METHODOLOGY_REQUIRED');
  return Object.freeze(rows.map(row=>Object.freeze({...row,publishedAt,methodologyVersion,immutable:true as const})));
}
