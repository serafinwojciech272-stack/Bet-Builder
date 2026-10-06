export interface ModelScore { modelId:string; sampleSize:number; brier:number; logLoss:number; roi:number; clv:number; }
export interface ChampionChallengerResult { champion:string; challenger:string; eligible:boolean; reasons:string[]; }
export function compareChampionChallenger(champion:ModelScore,challenger:ModelScore,minSample=20):ChampionChallengerResult {
 const reasons:string[]=[];
 if(challenger.sampleSize<minSample) reasons.push('INSUFFICIENT_SAMPLE');
 if(challenger.brier>champion.brier) reasons.push('WORSE_BRIER');
 if(challenger.logLoss>champion.logLoss) reasons.push('WORSE_LOG_LOSS');
 if(challenger.clv<champion.clv) reasons.push('WORSE_CLV');
 return {champion:champion.modelId,challenger:challenger.modelId,eligible:reasons.length===0,reasons};
}