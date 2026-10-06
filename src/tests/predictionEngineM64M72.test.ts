import {describe,it,expect} from 'vitest';
import {deriveProbability} from '../core/probabilityEngine';
import {evaluateConfidence} from '../core/confidenceEngine';
import {calculateEdge} from '../core/edgeEngine';
import {buildEnsemble} from '../core/ensembleEngine';
import {generatePrediction} from '../core/predictionEngineV2';
import {analyzeLineMovement} from '../core/lineMovement';
import {benchmarkClosingLine} from '../core/closingLineBenchmark';
import {explainPrediction} from '../core/predictionExplanation';
import {createPublicPerformanceLedger} from '../core/publicPerformanceLedger';

describe('M64-M72 prediction intelligence',()=>{
 it('blends calibrated probability without exceeding bounds',()=>{const x=deriveProbability({modelProbability:.72,marketProbability:.5,evidenceWeight:.8,calibrationFactor:.9});expect(x.probability).toBeGreaterThan(.5);expect(x.probability).toBeLessThan(1);});
 it('scores confidence with explicit weak-evidence reasons',()=>{const x=evaluateConfidence({probability:.55,evidenceQuality:.3,dataFreshness:.4,modelAgreement:.4,sampleSize:5});expect(x.band).toBe('LOW');expect(x.reasons).toEqual(expect.arrayContaining(['EVIDENCE_WEAK','DATA_STALE','MODEL_DISAGREEMENT','SMALL_SAMPLE']));});
 it('calculates positive edge separately from probability',()=>{const x=calculateEdge({probability:.6,odds:2});expect(x.value).toBe('POSITIVE');expect(x.edgePct).toBeCloseTo(10);});
 it('builds weighted ensemble and agreement',()=>{const x=buildEnsemble([{modelVersion:'a',probability:.6,weight:2},{modelVersion:'b',probability:.5,weight:1}]);expect(x.probability).toBeCloseTo(.5666667);expect(x.agreement).toBeGreaterThan(.9);});
 it('creates complete prediction packet',()=>{const x=generatePrediction({eventId:'e1',marketId:'m1',odds:2,modelVotes:[{modelVersion:'a',probability:.65,weight:1},{modelVersion:'b',probability:.6,weight:1}],evidenceQuality:.9,dataFreshness:.95,sampleSize:100});expect(x.eventId).toBe('e1');expect(x.expectedValue).toBeGreaterThan(0);});
 it('rejects invalid line movement',()=>expect(()=>analyzeLineMovement([{timestamp:'2026-01-01',odds:2,source:'a'}])).toThrow('LINE_MOVEMENT_INSUFFICIENT_POINTS'));
 it('benchmarks closing line without claiming outcome success',()=>{const x=benchmarkClosingLine({takenOdds:2,closingOdds:1.8,referenceSource:'reference-book',capturedAt:'2026-01-02'});expect(x.beatClose).toBe(true);});
 it('orders explanation by evidence weight',()=>{const x=explainPrediction({probability:.6,impliedProbability:.5,confidence:'HIGH',risk:'LOW',factors:[{id:'b',label:'b',direction:'CONTRA',weight:.2},{id:'a',label:'a',direction:'SUPPORTING',weight:.8}]});expect(x.factors[0].id).toBe('a');});
 it('freezes public ledger records',()=>{const x=createPublicPerformanceLedger([{modelVersion:'v1',sampleSize:20,settled:20,hitRate:.6,brierScore:.2,logLoss:.5,simulatedRoi:.1,meanClvPct:1,positiveClvRate:.6,confidenceAccuracy:.7,maxDrawdown:2,eligible:true}], '2026-01-03','m64-v1');expect(x[0].immutable).toBe(true);});
});
