import {compareChampionChallenger,type ModelScore} from './championChallenger';
export interface PromotionDecision { decision:'PROMOTE'|'HOLD'|'BLOCK'; reasons:string[]; }
export function evaluatePromotion(champion:ModelScore,challenger:ModelScore,minSample=20):PromotionDecision {
 const r=compareChampionChallenger(champion,challenger,minSample);
 if(r.reasons.includes('INSUFFICIENT_SAMPLE')) return {decision:'BLOCK',reasons:r.reasons};
 return {decision:r.eligible?'PROMOTE':'HOLD',reasons:r.reasons};
}