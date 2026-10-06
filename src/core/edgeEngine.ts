export interface EdgeInput { probability:number; odds:number; marketProbability?:number; }
export interface EdgeOutput { fairOdds:number; impliedProbability:number; edgePct:number; expectedValue:number; value:'POSITIVE'|'NEUTRAL'|'NEGATIVE'; }

export function calculateEdge(input:EdgeInput):EdgeOutput{
  if(!Number.isFinite(input.probability)||input.probability<=0||input.probability>=1)throw new Error('EDGE_PROBABILITY_INVALID');
  if(!Number.isFinite(input.odds)||input.odds<=1)throw new Error('EDGE_ODDS_INVALID');
  const impliedProbability=input.marketProbability??1/input.odds;
  const fairOdds=1/input.probability;
  const expectedValue=input.probability*input.odds-1;
  const edgePct=(input.probability-impliedProbability)*100;
  return {fairOdds,impliedProbability,edgePct,expectedValue,value:expectedValue>0?'POSITIVE':expectedValue<0?'NEGATIVE':'NEUTRAL'};
}
