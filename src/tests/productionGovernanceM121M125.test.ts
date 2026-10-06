import {describe,expect,it} from 'vitest';
import {evaluateSlo} from '../core/sloObservability';
import {routeProvider} from '../core/providerFailover';
import {evaluateQuota} from '../core/quotaGovernance';
import {simulateRelease} from '../core/releaseSimulation';
import {certifyProduction} from '../core/productionCertification';

describe('M121-M125 production governance',()=>{
 it('M121 detects breached SLO',()=>expect(evaluateSlo({availability:.97,latencyP95Ms:2400,errorRate:.02,freshness:.8},{availability:.99,latencyP95Ms:1000,errorRate:.01,freshness:.95}).status).toBe('BREACHED'));
 it('M122 selects failover provider',()=>expect(routeProvider([{id:'primary',healthy:false,latencyMs:100,freshness:1,priority:0},{id:'backup',healthy:true,latencyMs:150,freshness:.99,priority:1}]).mode).toBe('FAILOVER'));
 it('M122 degrades instead of lying about normal health',()=>expect(routeProvider([{id:'p1',healthy:true,latencyMs:5000,freshness:.4,priority:0}]).mode).toBe('DEGRADED'));
 it('M123 throttles before hard quota block',()=>expect(evaluateQuota({used:85,limit:100,windowSeconds:60}).decision).toBe('THROTTLE'));
 it('M123 blocks exhausted quota',()=>expect(evaluateQuota({used:100,limit:100,windowSeconds:60}).decision).toBe('BLOCK'));
 it('M124 holds on material regression',()=>expect(simulateRelease({smokePassed:true,securityPassed:true,integrityPassed:true,metrics:[{baseline:.9,candidate:.8,maxRegression:.05}]}).decision).toBe('HOLD'));
 it('M125 certifies only a fully green release',()=>{
  const r=certifyProduction({
   slo:{status:'HEALTHY',violations:[],score:1},
   provider:{mode:'PRIMARY',providerId:'p1',reason:'HEALTHY_PROVIDER_SELECTED'},
   quota:{decision:'ALLOW',remaining:90,utilization:.1,reason:'QUOTA_HEALTHY'},
   release:{decision:'PROMOTE',regressions:0,reasons:[]},
   testsPassed:true,securityPassed:true
  });
  expect(r).toEqual({certified:true,gate:'PASS',reasons:[]});
 });
 it('M125 blocks unsafe certification',()=>{
  const r=certifyProduction({
   slo:{status:'AT_RISK',violations:['LATENCY_P95'],score:.9},
   provider:{mode:'DEGRADED',providerId:'p1',reason:'NO_PROVIDER_MEETS_NORMAL_SLA'},
   quota:{decision:'BLOCK',remaining:0,utilization:1,reason:'QUOTA_HARD_LIMIT'},
   release:{decision:'HOLD',regressions:1,reasons:['METRIC_REGRESSION']},
   testsPassed:true,securityPassed:true
  });
  expect(r.certified).toBe(false);
 });
});