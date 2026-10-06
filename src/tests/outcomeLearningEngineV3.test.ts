import {describe,it,expect} from 'vitest';
import {gradePrediction,assertExactlyOnceSettlement} from '../core/outcomeEngine';
import {evaluateModelPerformance} from '../core/modelPerformance';
import {promoteModel,validateModelVersion} from '../core/modelVersioning';
import {buildLearningMemory} from '../core/learningMemory';
import type {PredictionRecord} from '../core/outcomeLearning';

const base=(i:number,outcome:PredictionRecord['outcome']='WON'):PredictionRecord=>({id:`p-${i}`,createdAt:'2026-01-01T00:00:00.000Z',eventId:`e-${i}`,selection:'A',probability:.7,odds:2,modelVersion:'core-sports-v1',outcome,settledAt:'2026-01-02T00:00:00.000Z'});

describe('M57-M63 outcome and learning engine',()=>{
 it('grades outcome with calibration and CLV',()=>{const g=gradePrediction(base(1),'WON','2026-01-03T00:00:00.000Z',1.8);expect(g.brierScore).toBeCloseTo(.09);expect(g.clvPct).toBeGreaterThan(0);expect(g.roi).toBe(1);});
 it('blocks double settlement',()=>expect(()=>assertExactlyOnceSettlement(base(1),'LOST')).toThrow('OUTCOME_ALREADY_SETTLED'));
 it('builds model performance only from settled evidence',()=>{const rows=Array.from({length:20},(_,i)=>base(i,i%2?'WON':'LOST'));const p=evaluateModelPerformance(rows);expect(p[0].eligible).toBe(true);expect(p[0].settled).toBe(20);expect(p[0].maxDrawdown).toBeGreaterThan(0);});
 it('requires evidence before model activation',()=>{const m={id:'v2',createdAt:'2026-01-01T00:00:00.000Z',status:'CANDIDATE' as const,parentVersion:'core-sports-v1',trainingSample:100,evaluationSample:19,evidenceRefs:[]};expect(()=>validateModelVersion({...m,status:'ACTIVE'})).toThrow('MODEL_VERSION_ACTIVE_SAMPLE_TOO_SMALL');expect(()=>promoteModel(m,20,'2026-01-03T00:00:00.000Z')).toThrow('MODEL_PROMOTION_EVIDENCE_REQUIRED');});
 it('creates learning memory without fabricating small-sample lessons',()=>{const memory=buildLearningMemory([base(1)]);expect(memory[0].signal).toBe('NEUTRAL');expect(memory[0].lesson).toMatch(/more verified outcomes/i);});
});
