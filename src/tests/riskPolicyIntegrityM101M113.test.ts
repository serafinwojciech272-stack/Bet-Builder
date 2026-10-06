import {describe,expect,it} from 'vitest';
import {evaluateRiskPolicy} from '../core/riskPolicy';

const selection={
  id:'s1',marketId:'m1',eventId:'e1',name:'Home',shortName:'H',odds:2,probability:.55,
  impliedProbability:.5,value:.1,ev:.1,confidence:.8,risk:'LOW' as const,correlationGroup:'g1'
};

describe('canonical RISK_POLICY integrity integration M101-M113',()=>{
  it('hard-blocks point-in-time failure, leakage and stress breach',()=>{
    const r=evaluateRiskPolicy({
      selections:[selection],dataFreshness:1,evidenceQuality:1,providerState:'HEALTHY',
      riskIntelligence:{pointInTimeValid:false,dataLeakageFree:false,stressBreached:true}
    });
    expect(r.decision).toBe('BLOCKED');
    expect(r.reasons).toEqual(expect.arrayContaining(['POINT_IN_TIME_FAILURE','DATA_LEAKAGE','STRESS_BREACH']));
  });
  it('routes drift, provider discrepancy, correlation and concentration to review',()=>{
    const r=evaluateRiskPolicy({
      selections:[selection],dataFreshness:1,evidenceQuality:1,providerState:'HEALTHY',
      riskIntelligence:{driftSeverity:'HIGH',providerReconciled:false,maxCorrelation:.9,exposureConcentration:.6}
    });
    expect(r.decision).toBe('REVIEW');
    expect(r.reasons).toEqual(expect.arrayContaining(['MODEL_DRIFT','PROVIDER_DISCREPANCY','HIGH_CORRELATION','EXPOSURE_CONCENTRATION']));
  });
  it('preserves CLEAR when optional intelligence is healthy',()=>{
    const r=evaluateRiskPolicy({
      selections:[selection],dataFreshness:1,evidenceQuality:1,providerState:'HEALTHY',
      riskIntelligence:{pointInTimeValid:true,referenceMarketEligible:true,dataLeakageFree:true,driftSeverity:'NONE',providerReconciled:true,stressBreached:false,maxCorrelation:0,exposureConcentration:0}
    });
    expect(r.decision).toBe('CLEAR');
  });
});
