import {describe,it,expect} from 'vitest';
import {buildModelTournament,createDecisionReplay,explainPrediction} from '../core/predictionIntelligence';
import type {Prediction} from '../core/predictionEngine';
import type {PredictionRecord} from '../core/outcomeLearning';
const prediction:Prediction={selectionId:'s1',eventId:'e1',marketId:'m1',label:'Home',probability:.7,confidence:.8,fairOdds:1/.7,marketOdds:2,edge:.2,ev:.4,risk:'LOW',modelVersion:'core-sports-v1',reasons:['market baseline']};
describe('Prediction Intelligence Cockpit',()=>{
 it('creates an immutable decision replay shape without inventing an outcome',()=>{const r=createDecisionReplay(prediction);expect(r.outcome).toBe('PENDING');expect(r.stages).toContain('DATA SNAPSHOT');});
 it('explains both supporting and opposing factors',()=>{const e=explainPrediction(prediction);expect(e.supporting.length).toBeGreaterThan(0);expect(e.neutral.length).toBeGreaterThan(0);});
 it('does not rank models before the minimum settled sample exists',()=>{const records:PredictionRecord[]=Array.from({length:3},(_,i)=>({id:String(i),createdAt:'2026-10-06T10:00:00Z',eventId:'e'+i,selection:'x',probability:.7,odds:2,modelVersion:'v1',outcome:'WON'}));const t=buildModelTournament(records,20);expect(t[0].eligible).toBe(false);expect(t[0].rank).toBeNull();});
 it('ranks eligible models by performance',()=>{const records:PredictionRecord[]=Array.from({length:20},(_,i)=>({id:'a'+i,createdAt:'2026-10-06T10:00:00Z',eventId:'ea'+i,selection:'x',probability:.7,odds:2,modelVersion:'good',outcome:i<18?'WON':'LOST'} as PredictionRecord)).concat(Array.from({length:20},(_,i)=>({id:'b'+i,createdAt:'2026-10-06T10:00:00Z',eventId:'eb'+i,selection:'x',probability:.55,odds:2,modelVersion:'bad',outcome:i<8?'WON':'LOST'} as PredictionRecord)));const t=buildModelTournament(records,20);expect(t.find(x=>x.modelVersion==='good')?.rank).toBe(1);});
});
