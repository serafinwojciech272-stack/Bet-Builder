import type { CouponResult, CouponLeg } from './couponEngine';

export type CouponRiskProfile = 'NIŻSZE' | 'UMIARKOWANE' | 'WYSOKIE' | 'BARDZO WYSOKIE';
export type CouponVariantKey = 'SAFER' | 'BALANCED' | 'AGGRESSIVE';
export type LegRecommendation = 'KEEP' | 'REVIEW' | 'BLOCK';

export interface CouponLegExplanation {
  selectionId: string;
  short: string;
  full: string;
  primaryArgument: string;
  primaryRisk: string;
  couponImpact: string;
  correlation: string;
  evidenceBacked: boolean;
}

export interface CouponRiskAssessment {
  profile: CouponRiskProfile;
  probability: number;
  value: number;
  correlation: number;
  volatility: number;
  reasons: string[];
}

export interface CouponVariant {
  key: CouponVariantKey;
  label: string;
  description: string;
  coupon: CouponResult;
  risk: CouponRiskProfile;
  avgValue: number;
  avgConfidence: number;
}

export interface CouponSnapshot {
  id: string;
  schemaVersion: 1;
  createdAt: string;
  targetOdds: number;
  stake: number;
  sport: string;
  selectedVariant: 'AI_SELECTED' | CouponVariantKey;
  coupon: CouponResult;
  explanation: CouponLegExplanation[];
  risk: CouponRiskAssessment;
  provenance: unknown;
  certification: unknown;
  pdf?: { status: 'GENERATING' | 'READY' | 'FAILED'; artifactId?: string; generatedAt?: string; error?: string };
  approvalState: 'PENDING';
  executionPolicy: 'OBSERVATIONAL_ONLY';
  auditEvents: CouponAuditEvent[];
}

export interface CouponAuditEvent {
  id: string;
  type: 'COUPON_CREATED' | 'VARIANT_SELECTED' | 'LEG_REPLACED' | 'PDF_READY' | 'PDF_FAILED' | 'FEEDBACK_RECORDED' | 'APPROVAL_REQUESTED' | 'MISSION_CREATED';
  at: string;
  actor: 'SYSTEM' | 'USER';
  payload: Record<string, unknown>;
}

const clamp=(n:number,min=0,max=1)=>Math.max(min,Math.min(max,Number.isFinite(n)?n:min));
const pct=(n:number)=>`${(clamp(n)*100).toFixed(0)}%`;
const riskWeight=(risk:CouponLeg['risk'])=>risk==='CRITICAL'?1:risk==='HIGH'?.72:risk==='MEDIUM'?.45:.2;

export function buildCouponExplanation(coupon: CouponResult): CouponLegExplanation[] {
  return coupon.legs.map((leg)=>{
    const implied=1/leg.marketOdds;
    const delta=leg.probability-implied;
    const primaryArgument=leg.reasons[0] ?? 'Brak zarejestrowanego argumentu modelu.';
    const primaryRisk=leg.risk==='CRITICAL'||leg.risk==='HIGH'
      ? 'Podwyższone ryzyko modelowe dla tej selekcji.'
      : leg.risk==='MEDIUM' ? 'Umiarkowana niepewność modelu.' : 'Brak podwyższonego sygnału ryzyka w zapisanych danych.';
    const couponImpact=`Selekcja wnosi kurs x${leg.marketOdds.toFixed(2)}, model probability ${pct(leg.probability)} i EV ${leg.ev>=0?'+':''}${(leg.ev*100).toFixed(1)}%.`;
    const correlation=leg.marketId ? `Grupa korelacji: ${leg.marketId}.` : 'Brak zapisanej grupy korelacji.';
    const short=`${primaryArgument} Model ${delta>=0?'powyżej':'poniżej'} implied probability rynku.`;
    const full=`${primaryArgument} Kurs x${leg.marketOdds.toFixed(2)} odpowiada implied probability ${pct(implied)}, podczas gdy model wskazuje ${pct(leg.probability)}. Value/edge: ${leg.edge>=0?'+':''}${(leg.edge*100).toFixed(1)}%. Confidence: ${pct(leg.confidence)}. ${primaryRisk} ${couponImpact} ${correlation}`;
    return {selectionId:leg.selectionId,short,full,primaryArgument,primaryRisk,couponImpact,correlation,evidenceBacked:Boolean(leg.reasons.length),};
  });
}

export function assessCouponRisk(coupon: CouponResult): CouponRiskAssessment {
  if (!coupon.legs.length) return {profile:'BARDZO WYSOKIE',probability:0,value:0,correlation:1,volatility:1,reasons:['Brak kwalifikowanych selekcji.']};
  const probability=clamp(coupon.estimatedProbability);
  const value=clamp(coupon.estimatedEv*.5+.5);
  const avgRisk=coupon.legs.reduce((a,l)=>a+riskWeight(l.risk),0)/coupon.legs.length;
  const markets=new Set(coupon.legs.map(l=>l.marketId));
  const correlation=clamp(1-markets.size/coupon.legs.length);
  const volatility=clamp((1-probability)*.55+avgRisk*.35+correlation*.1);
  const profile:CouponRiskProfile=volatility<.28?'NIŻSZE':volatility<.48?'UMIARKOWANE':volatility<.70?'WYSOKIE':'BARDZO WYSOKIE';
  const reasons=[
    `Model probability: ${pct(probability)}.`,
    `Value/EV modelu: ${coupon.estimatedEv>=0?'+':''}${(coupon.estimatedEv*100).toFixed(1)}%.`,
    `Korelacja selekcji: ${(correlation*100).toFixed(0)}%.`,
    `Zmienność ryzyka selekcji: ${(avgRisk*100).toFixed(0)}%.`,
  ];
  return {profile,probability,value,correlation,volatility,reasons};
}

export function buildVariants(coupon: CouponResult): CouponVariant[] {
  const legs=[...coupon.legs];
  const avgConfidence=legs.length?legs.reduce((a,l)=>a+l.confidence,0)/legs.length:0;
  const avgValue=legs.length?legs.reduce((a,l)=>a+l.ev,0)/legs.length:0;
  const make=(key:CouponVariantKey,label:string,description:string,sorted:CouponLeg[],take:number):CouponVariant=>{
    const chosen=sorted.slice(0,Math.max(1,Math.min(sorted.length,take)));
    const combined=chosen.reduce((a,l)=>a*l.marketOdds,1);
    const probability=chosen.reduce((a,l)=>a*l.probability,1);
    const ev=combined*probability-1;
    const next:CouponResult={...coupon,legs:chosen,combinedOdds:combined,potentialReturn:coupon.stake*combined,potentialProfit:Math.max(0,coupon.stake*combined-coupon.stake),estimatedProbability:probability,estimatedEv:ev,status:chosen.length?'READY':'BLOCKED',blockers:chosen.length?[]:['NO_VARIANT_SELECTIONS'],warnings:chosen.length?[]:['VARIANT_DERIVED_FROM_CURRENT_CONTEXT'],rationale:[...coupon.rationale,`Variant ${label} derived from the persisted candidate context.`]};
    const risk=assessCouponRisk(next);
    return {key,label,description,coupon:next,risk:risk.profile,avgValue:chosen.length?chosen.reduce((a,l)=>a+l.ev,0)/chosen.length:0,avgConfidence:chosen.length?chosen.reduce((a,l)=>a+l.confidence,0)/chosen.length:0};
  };
  const byConfidence=[...legs].sort((a,b)=>b.confidence-a.confidence||b.ev-a.ev);
  const byValue=[...legs].sort((a,b)=>b.ev-a.ev||b.confidence-a.confidence);
  const byOdds=[...legs].sort((a,b)=>b.marketOdds-a.marketOdds);
  const baseCount=Math.max(1,legs.length);
  return [
    make('SAFER','BEZPIECZNIEJSZY','Mniej selekcji, preferencja dla confidence i niższego ryzyka.',byConfidence,Math.max(1,Math.ceil(baseCount*.6))),
    make('BALANCED','ZBALANSOWANY','Kompromis między confidence, value i docelowym kursem.',byValue,Math.max(1,Math.ceil(baseCount*.8))),
    make('AGGRESSIVE','AGRESYWNY','Więcej ekspozycji na kurs i value przy wyższym ryzyku.',byOdds,baseCount),
  ];
}

export function replaceLegInContext(coupon: CouponResult, selectionId: string, replacement: CouponLeg): CouponResult {
  const legs=coupon.legs.map(l=>l.selectionId===selectionId?replacement:l);
  const combined=legs.reduce((a,l)=>a*l.marketOdds,1);
  const probability=legs.reduce((a,l)=>a*l.probability,1);
  const ev=combined*probability-1;
  return {...coupon,legs,combinedOdds:combined,potentialReturn:coupon.stake*combined,potentialProfit:Math.max(0,coupon.stake*combined-coupon.stake),estimatedProbability:probability,estimatedEv:ev,status:legs.length?'READY':'BLOCKED',warnings:[...coupon.warnings,'LEG_REPLACED_RECALCULATED']};
}

export function findSimilarLegs(coupon: CouponResult, selectedId: string, candidates: CouponLeg[]): CouponLeg[] {
  const current=coupon.legs.find(l=>l.selectionId===selectedId);
  if(!current) return [];
  return candidates.filter(c=>c.selectionId!==selectedId && c.eventId!==current.eventId)
    .filter(c=>Math.abs(c.marketOdds-current.marketOdds)<=Math.max(.75,current.marketOdds*.45))
    .sort((a,b)=>Math.abs(a.marketOdds-current.marketOdds)-Math.abs(b.marketOdds-current.marketOdds)||b.ev-a.ev).slice(0,4);
}

export function parseNaturalLanguageIntent(input:string) {
  const text=input.trim();
  const odds=text.match(/(?:około|okolo|kurs|odds)\s*(?:x)?\s*(\d+(?:[.,]\d+)?)/i);
  const stake=text.match(/(\d+(?:[.,]\d+)?)\s*(?:zł|zl|pln|złotych)/i);
  const risk=text.match(/(bezpiecz|nisk\w* ryzyk|mniej ryzyk|bardzo ryzykown|ryzykown)/i)?'LOW':text.match(/(agresyw|wysok\w* ryzyk)/i)?'HIGH':undefined;
  const sport=text.match(/(piłk\w*|football|soccer|koszyk\w*|basketball|tenis|tennis)/i)?.[1] ?? undefined;
  const targetOdds=odds?Number(odds[1].replace(',','.')):undefined;
  const stakeValue=stake?Number(stake[1].replace(',','.')):undefined;
  return {targetOdds:targetOdds&&targetOdds>1?targetOdds:undefined,stake:stakeValue&&stakeValue>=0?stakeValue:undefined,riskPreference:risk,sport,raw:text,needsConfirmation:true};
}
