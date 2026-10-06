export interface ModelVote { modelVersion:string; probability:number; weight:number; }
export interface EnsembleResult { probability:number; agreement:number; contributors:string[]; }

export function buildEnsemble(votes:ModelVote[]):EnsembleResult{
  if(!votes.length)throw new Error('ENSEMBLE_EMPTY');
  const valid=votes.filter(v=>Number.isFinite(v.probability)&&v.probability>=0&&v.probability<=1&&Number.isFinite(v.weight)&&v.weight>0);
  if(!valid.length)throw new Error('ENSEMBLE_NO_VALID_MODELS');
  const total=valid.reduce((s,v)=>s+v.weight,0);
  const probability=valid.reduce((s,v)=>s+v.probability*v.weight,0)/total;
  const mean=probability;
  const variance=valid.reduce((s,v)=>s+v.weight*(v.probability-mean)**2,0)/total;
  return {probability,agreement:Math.max(0,Math.min(1,1-Math.sqrt(variance)*2)),contributors:valid.map(v=>v.modelVersion)};
}
