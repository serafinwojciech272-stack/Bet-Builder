export interface ProbabilityInput { modelProbability:number; marketProbability:number; evidenceWeight:number; calibrationFactor?:number; }
export interface ProbabilityOutput { probability:number; impliedProbability:number; disagreement:number; method:'MODEL_ONLY'|'CALIBRATED'|'BLENDED'; }

const clamp=(x:number)=>Math.max(.001,Math.min(.999,x));

export function deriveProbability(input:ProbabilityInput):ProbabilityOutput{
  const p=clamp(input.modelProbability);
  const market=clamp(input.marketProbability);
  const w=Math.max(0,Math.min(1,input.evidenceWeight));
  const calibration= input.calibrationFactor===undefined ? 1 : Math.max(.5,Math.min(1.5,input.calibrationFactor));
  const calibrated=clamp(.5+(p-.5)*calibration);
  const probability=clamp(calibrated*w+market*(1-w));
  return {probability,impliedProbability:market,disagreement:probability-market,method:calibration===1&&w===1?'MODEL_ONLY':w===1?'CALIBRATED':'BLENDED'};
}
