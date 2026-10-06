export interface PointInTimeRecord {
  id: string;
  eventId: string;
  eventStartAt: string;
  observedAt: string;
  availableAt?: string;
  source: string;
  payloadHash?: string;
}

export interface PointInTimeViolation {
  recordId: string;
  code: 'FUTURE_OBSERVATION' | 'FUTURE_AVAILABILITY' | 'INVALID_TIMESTAMP' | 'DUPLICATE_SNAPSHOT';
  message: string;
}

export interface PointInTimeAudit {
  valid: boolean;
  violations: PointInTimeViolation[];
  checked: number;
}

const time=(value:string)=>Date.parse(value);

export function auditPointInTime(records: PointInTimeRecord[]): PointInTimeAudit {
  const violations: PointInTimeViolation[]=[];
  const seen=new Set<string>();
  for(const r of records){
    const event=time(r.eventStartAt), observed=time(r.observedAt), available=r.availableAt?time(r.availableAt):observed;
    if(!r.id||!r.eventId||!r.source||[event,observed,available].some(Number.isNaN)){
      violations.push({recordId:r.id||'UNKNOWN',code:'INVALID_TIMESTAMP',message:'Identity, source and timestamps are required.'});
      continue;
    }
    if(observed>event) violations.push({recordId:r.id,code:'FUTURE_OBSERVATION',message:'Observed timestamp is after event start.'});
    if(available>event) violations.push({recordId:r.id,code:'FUTURE_AVAILABILITY',message:'Data became available after event start.'});
    const key=r.payloadHash?String(r.payloadHash):`${r.eventId}|${r.source}|${r.observedAt}`;
    if(seen.has(key)) violations.push({recordId:r.id,code:'DUPLICATE_SNAPSHOT',message:'Duplicate point-in-time snapshot.'});
    seen.add(key);
  }
  return {valid:violations.length===0,violations,checked:records.length};
}

export function assertPointInTime(records: PointInTimeRecord[]): void {
  const audit=auditPointInTime(records);
  if(!audit.valid) throw new Error(`POINT_IN_TIME_INTEGRITY_FAILED:${audit.violations.map(v=>v.code).join(',')}`);
}
