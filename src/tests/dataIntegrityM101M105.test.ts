import {describe,expect,it} from 'vitest';
import {auditPointInTime,assertPointInTime} from '../core/pointInTimeIntegrity';
import {devigMarket} from '../core/marketDevig';
import {evaluateReferenceMarket} from '../core/referenceMarketQuality';
import {runWalkForwardBacktest} from '../core/walkForwardBacktest';
import {detectDataLeakage,assertNoDataLeakage} from '../core/dataLeakageDetection';

describe('M101 point-in-time integrity',()=>{
  it('rejects future and duplicate observations',()=>{
    const result=auditPointInTime([
      {id:'a',eventId:'e',eventStartAt:'2026-01-01T12:00:00Z',observedAt:'2026-01-01T11:00:00Z',source:'x',payloadHash:'1'},
      {id:'b',eventId:'e',eventStartAt:'2026-01-01T12:00:00Z',observedAt:'2026-01-01T13:00:00Z',source:'x',payloadHash:'2'},
      {id:'c',eventId:'e',eventStartAt:'2026-01-01T12:00:00Z',observedAt:'2026-01-01T11:00:00Z',source:'x',payloadHash:'1'}
    ]);
    expect(result.valid).toBe(false);
    expect(result.violations.map(v=>v.code)).toContain('FUTURE_OBSERVATION');
    expect(result.violations.map(v=>v.code)).toContain('DUPLICATE_SNAPSHOT');
    expect(()=>assertPointInTime(result as never)).toThrow('POINT_IN_TIME_INTEGRITY_FAILED');
  });
});

describe('M102 market de-vig',()=>{
  it('normalizes a two-way overround to a fair probability sum of one',()=>{
    const result=devigMarket([{selectionId:'a',odds:2},{selectionId:'b',odds:2}]);
    expect(result.overround).toBeCloseTo(0);
  });
  it('removes an actual overround',()=>{
    const result=devigMarket([{selectionId:'a',odds:1.8},{selectionId:'b',odds:1.8}]);
    expect(result.overround).toBeGreaterThan(0);
    expect(result.prices.reduce((s,p)=>s+p.fairProbability,0)).toBeCloseTo(1);
  });
});

describe('M103 reference market quality',()=>{
  it('marks a complete fresh multi-source market eligible',()=>{
    const q=evaluateReferenceMarket({provider:'primary',capturedAt:'2026-01-01T11:00:00Z',eventStartAt:'2026-01-01T12:00:00Z',sourceCount:5,expectedSourceCount:5,complete:true,oddsValid:true});
    expect(q.grade).toBe('A'); expect(q.eligible).toBe(true);
  });
  it('rejects post-event reference capture',()=>{
    expect(()=>evaluateReferenceMarket({provider:'x',capturedAt:'2026-01-01T13:00:00Z',eventStartAt:'2026-01-01T12:00:00Z',sourceCount:5,expectedSourceCount:5,complete:true,oddsValid:true})).toThrow('REFERENCE_CAPTURE_AFTER_EVENT');
  });
});

describe('M104 walk-forward',()=>{
  it('creates chronological train/test windows without overlap',()=>{
    const records=Array.from({length:10},(_,i)=>({id:String(i),eventStartAt:`2026-01-0${i+1}T12:00:00Z`,observedAt:`2026-01-0${i+1}T10:00:00Z`,featuresAvailableAt:`2026-01-0${i+1}T11:00:00Z`,label:i%2}));
    const r=runWalkForwardBacktest(records,4,2,2);
    expect(r.leakageFree).toBe(true); expect(r.windows.length).toBe(3); expect(r.tested).toBe(6);
  });
});

describe('M105 leakage detection',()=>{
  it('detects future and label-derived features',()=>{
    const findings=detectDataLeakage([
      {feature:'form',eventId:'e1',eventStartAt:'2026-01-01T12:00:00Z',featureObservedAt:'2026-01-01T10:00:00Z',featureAvailableAt:'2026-01-01T11:00:00Z',source:'x'},
      {feature:'outcome_result',eventId:'e2',eventStartAt:'2026-01-01T12:00:00Z',featureObservedAt:'2026-01-01T13:00:00Z',featureAvailableAt:'2026-01-01T13:00:00Z',source:'x',derivedFromLabel:true}
    ]);
    expect(findings.map(f=>f.code)).toContain('FUTURE_FEATURE');
    expect(findings.map(f=>f.code)).toContain('LABEL_IN_FEATURE');
    expect(()=>assertNoDataLeakage([ {feature:'x',eventId:'e',eventStartAt:'2026-01-01T12:00:00Z',featureObservedAt:'2026-01-01T13:00:00Z',featureAvailableAt:'2026-01-01T13:00:00Z',source:'x'} ])).toThrow('DATA_LEAKAGE_DETECTED');
  });
});
