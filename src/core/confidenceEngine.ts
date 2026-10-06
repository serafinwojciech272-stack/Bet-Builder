export interface ConfidenceInput { probability:number; evidenceQuality:number; dataFreshness:number; modelAgreement:number; sampleSize:number; }
export interface ConfidenceOutput { score:number; band:'LOW'|'MEDIUM'|'HIGH'|'VERY_HIGH'; reasons:string[]; }

const clamp=(x:number)=>Math.max(0,Math.min(1,x));

export function evaluateConfidence(input:ConfidenceInput):ConfidenceOutput{
  const p=clamp(input.probability), evidence=clamp(input.evidenceQuality), freshness=clamp(input.dataFreshness), agreement=clamp(input.modelAgreement);
  const sample=Math.min(1,Math.max(0,input.sampleSize)/100);
  const extremity=Math.min(1,Math.abs(p-.5)*2);
  const score=clamp(evidence*.3+freshness*.2+agreement*.25+sample*.15+extremity*.1);
  const band=score>=.85?'VERY_HIGH':score>=.7?'HIGH':score>=.5?'MEDIUM':'LOW';
  const reasons:string[]=[];
  if(evidence<.5)reasons.push('EVIDENCE_WEAK');
  if(freshness<.5)reasons.push('DATA_STALE');
  if(agreement<.5)reasons.push('MODEL_DISAGREEMENT');
  if(input.sampleSize<20)reasons.push('SMALL_SAMPLE');
  return {score,band,reasons};
}
