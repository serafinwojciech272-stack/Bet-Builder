import { describe, expect, it } from 'vitest';
import handler from './coupon-lab';

function response(){let value:any;return {statusCode:0,body:undefined as any,status(n:number){this.statusCode=n;return this;},json(v:any){this.body=v;value=v;return this;},get(){return value;}};}
const coupon={status:'READY',targetOdds:10,combinedOdds:8,stake:20,potentialReturn:160,potentialProfit:140,estimatedProbability:.2,estimatedEv:.6,legs:[{selectionId:'e2',eventId:'event-2',marketId:'market-2',label:'1X',probability:.6,confidence:.8,fairOdds:1.66,marketOdds:2,edge:.1,ev:.2,risk:'LOW',modelVersion:'test',reasons:['live evidence'],eventLabel:'A vs B',league:'Test',startTime:'2026-10-07T18:00:00Z'}],blockers:[],warnings:[],rationale:['live evidence']};
describe('Coupon Lab API E2E contract',()=>{
 it('saves snapshot, reads identical snapshot, generates PDF and records feedback',async()=>{
   const save=response(); await handler({method:'POST',query:{},body:{action:'save',coupon,certification:{status:'CERTIFIED'},provenance:{provider:'test',normalizedAt:'2026-10-07T17:00:00Z'},sport:'soccer'}},save as any);
   expect(save.statusCode).toBe(200); const id=save.get().id; expect(id).toMatch(/^cp_/);
   const read=response(); await handler({method:'GET',query:{id},body:{}},read as any); expect(read.get().id).toBe(id); expect(read.get().coupon.legs[0].selectionId).toBe('e2');
   const pdf=response(); await handler({method:'POST',query:{},body:{action:'pdf',id}},pdf as any); expect(pdf.get().status).toBe('READY'); expect(pdf.get().base64.length).toBeGreaterThan(100);
   const feedback=response(); await handler({method:'POST',query:{},body:{action:'feedback',id,helpful:true}},feedback as any); expect(feedback.get().auditEvents.at(-1).type).toBe('FEEDBACK_RECORDED');
 });
});
