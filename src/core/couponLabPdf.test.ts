import { describe, expect, it } from 'vitest';
import { renderCouponPdf } from './couponLabPdf';
import type { CouponSnapshot } from './couponLabDomain';

const snapshot: CouponSnapshot = {
  id:'cp_test', schemaVersion:1, createdAt:'2026-10-07T18:00:00Z', targetOdds:10, stake:20, sport:'soccer',
  selectedVariant:'AI_SELECTED',
  coupon:{status:'READY',targetOdds:10,combinedOdds:8,stake:20,potentialReturn:160,potentialProfit:140,estimatedProbability:.2,estimatedEv:.6,
    legs:[{selectionId:'s1',eventId:'e1',marketId:'m1',label:'1X',probability:.6,confidence:.8,fairOdds:1.66,marketOdds:2,edge:.1,ev:.2,risk:'LOW',modelVersion:'test',reasons:['evidence'],eventLabel:'A vs B',league:'League',startTime:'2026-10-07T18:00:00Z'}],blockers:[],warnings:[],rationale:['evidence']},
  explanation:[{selectionId:'s1',short:'Model signal.',full:'Full model signal.',primaryArgument:'evidence',primaryRisk:'low',couponImpact:'impact',correlation:'m1',evidenceBacked:true}],
  risk:{profile:'UMIARKOWANE',probability:.2,value:.8,correlation:0,volatility:.4,reasons:['probability']},
  provenance:{provider:'test',normalizedAt:'2026-10-07T17:59:00Z'}, certification:{status:'CERTIFIED'},
  pdf:{status:'READY'}, approvalState:'PENDING', executionPolicy:'OBSERVATIONAL_ONLY', auditEvents:[]
};
describe('coupon PDF',()=>it('contains the persisted analytical content',()=>{const text=new TextDecoder().decode(renderCouponPdf(snapshot));expect(text.startsWith('%PDF-1.4')).toBe(true);expect(text).toContain('BET BUILDER');expect(text).toContain('Kupon jest propozycją analityczną');expect(text).toContain('A vs B');}));
