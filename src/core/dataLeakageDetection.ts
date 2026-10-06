export type LeakageCode='FUTURE_FEATURE'|'TARGET_AFTER_FEATURE'|'LABEL_IN_FEATURE'|'SAME_EVENT_TRAIN_TEST'|'FUTURE_AVAILABILITY';

export interface FeatureProvenance {
  feature:string;
  eventId:string;
  eventStartAt:string;
  featureObservedAt:string;
  featureAvailableAt:string;
  source:string;
  derivedFromLabel?:boolean;
}

export interface LeakageFinding { code:LeakageCode; feature:string; eventId:string; severity:'ERROR'|'WARNING'; message:string; }

export function detectDataLeakage(features:FeatureProvenance[]):LeakageFinding[] {
  const findings:LeakageFinding[]=[];
  const groups=new Map<string,Set<string>>();
  for(const f of features){
    const event=Date.parse(f.eventStartAt),observed=Date.parse(f.featureObservedAt),available=Date.parse(f.featureAvailableAt);
    if([event,observed,available].some(Number.isNaN)){
      findings.push({code:'FUTURE_AVAILABILITY',feature:f.feature,eventId:f.eventId,severity:'ERROR',message:'Invalid provenance timestamp.'});
      continue;
    }
    if(observed>event) findings.push({code:'FUTURE_FEATURE',feature:f.feature,eventId:f.eventId,severity:'ERROR',message:'Feature observed after event start.'});
    if(available>event) findings.push({code:'FUTURE_AVAILABILITY',feature:f.feature,eventId:f.eventId,severity:'ERROR',message:'Feature became available after event start.'});
    if(f.derivedFromLabel) findings.push({code:'LABEL_IN_FEATURE',feature:f.feature,eventId:f.eventId,severity:'ERROR',message:'Feature explicitly derives from target outcome.'});
    if(/(^|[_-])(label|outcome|result|score)([_-]|$)/i.test(f.feature)) findings.push({code:'LABEL_IN_FEATURE',feature:f.feature,eventId:f.eventId,severity:'WARNING',message:'Feature name resembles a target-derived field; provenance must be reviewed.'});
    const set=groups.get(f.feature)??new Set<string>(); set.add(f.eventId); groups.set(f.feature,set);
  }
  return findings;
}

export function assertNoDataLeakage(features:FeatureProvenance[]):void {
  const findings=detectDataLeakage(features);
  const errors=findings.filter(f=>f.severity==='ERROR');
  if(errors.length) throw new Error(`DATA_LEAKAGE_DETECTED:${errors.map(f=>f.code).join(',')}`);
}
