export interface OddsPoint { timestamp:string; odds:number; source:string; }
export interface LineMovementResult { openingOdds:number; currentOdds:number; bestOdds:number; movementPct:number; sourceCount:number; }

export function analyzeLineMovement(points:OddsPoint[]):LineMovementResult{
  if(points.length<2)throw new Error('LINE_MOVEMENT_INSUFFICIENT_POINTS');
  const ordered=[...points].sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
  if(ordered.some(p=>Number.isNaN(Date.parse(p.timestamp))||!Number.isFinite(p.odds)||p.odds<=1))throw new Error('LINE_MOVEMENT_POINT_INVALID');
  const openingOdds=ordered[0].odds,currentOdds=ordered.at(-1)!.odds,bestOdds=Math.max(...ordered.map(p=>p.odds));
  return {openingOdds,currentOdds,bestOdds,movementPct:(currentOdds/openingOdds-1)*100,sourceCount:new Set(ordered.map(p=>p.source)).size};
}
