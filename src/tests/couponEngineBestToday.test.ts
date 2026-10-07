import {describe,it,expect} from 'vitest';
import type {Selection,EventWithMarkets} from '../domain/types';
import {generateCoupon} from '../core/couponEngine';

const selection=(id:string,marketId:string,eventId:string,odds:number,probability:number,ev:number):Selection=>({
 id,marketId,eventId,name:id,shortName:id,odds,probability,impliedProbability:1/odds,value:probability-1/odds,ev,confidence:.82,risk:'LOW',correlationGroup:eventId
});

const events:EventWithMarkets[]=[
 {id:'today-1',sport:'soccer',league:'L',competition:'L',homeTeam:'A',awayTeam:'B',startTime:'2026-10-07T18:00:00Z',status:'SCHEDULED',markets:[{id:'m1',eventId:'today-1',type:'match-winner',name:'Winner',category:'x',status:'OPEN',selections:[selection('s1','m1','today-1',1.7,.7,.19)]}]},
 {id:'today-2',sport:'soccer',league:'L',competition:'L',homeTeam:'C',awayTeam:'D',startTime:'2026-10-07T20:00:00Z',status:'SCHEDULED',markets:[{id:'m2',eventId:'today-2',type:'match-winner',name:'Winner',category:'x',status:'OPEN',selections:[selection('s2','m2','today-2',1.9,.69,.311)]}]},
 {id:'finished',sport:'soccer',league:'L',competition:'L',homeTeam:'E',awayTeam:'F',startTime:'2026-10-07T12:00:00Z',status:'FINISHED',markets:[{id:'m3',eventId:'finished',type:'match-winner',name:'Winner',category:'x',status:'OPEN',selections:[selection('s3','m3','finished',3,.8,.8)]}]}
];

describe('best today coupon',()=>{
 it('uses best-today scoring and excludes finished events',()=>{
  const r=generateCoupon({events,targetOdds:10,stake:20,strategy:'BEST_TODAY',maxLegs:3,minConfidence:.55});
  expect(r.legs.every(x=>x.eventId!=='finished')).toBe(true);
  expect(r.stake).toBe(20);
  expect(r.rationale.join(' ')).toContain('BEST_TODAY');
 });
});
