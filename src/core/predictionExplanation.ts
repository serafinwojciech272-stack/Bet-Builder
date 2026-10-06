export type ExplanationDirection='SUPPORTING'|'NEUTRAL'|'CONTRA';
export interface ExplanationFactor { id:string; label:string; direction:ExplanationDirection; weight:number; evidenceRef?:string; }
export interface PredictionExplanation { summary:string; factors:ExplanationFactor[]; confidence:string; riskNote:string; }

export function explainPrediction(input:{probability:number;impliedProbability:number;confidence:string;factors:ExplanationFactor[];risk:string}):PredictionExplanation{
  const ordered=[...input.factors].sort((a,b)=>Math.abs(b.weight)-Math.abs(a.weight));
  const support=ordered.filter(x=>x.direction==='SUPPORTING').length;
  const contra=ordered.filter(x=>x.direction==='CONTRA').length;
  const summary=input.probability>input.impliedProbability
    ? `Model probability exceeds market-implied probability; evidence balance: ${support} supporting vs ${contra} contra factors.`
    : `Model probability does not exceed market-implied probability; evidence balance: ${support} supporting vs ${contra} contra factors.`;
  return {summary,factors:ordered,confidence:input.confidence,riskNote:`Risk policy remains authoritative: ${input.risk}.`};
}
