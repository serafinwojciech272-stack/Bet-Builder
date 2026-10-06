import {describe,expect,it} from 'vitest';
import {evaluateSLOs,sloGate} from '../core/sloObservability';
import {selectProvider} from '../core/providerFailover';
import {evaluateQuota} from '../core/apiQuotaGovernance';
import {simulateRelease,assertShadowSafe} from '../core/releaseSimulation';
import {certifyProduction} from '../core/productionCertification';

describe('M121-M125 production governance',()=>{
 it('evaluates SLO health and breach',()=>{
  const healthy=evaluateSLOs([{name:'availability',target:.99,direction:'MIN'}],[{name:'availability',value:.995}]);
  expect(sloGate(healthy)).toBe('HEALTHY');
  const bad=evaluateSLOs([{name:'availability',target:.99,direction:'MIN'}],[{name:'availability',value:.95}]);
  expect(sloGate(bad)).toBe('BREACHED');
 });
 it('fails over when primary is offline',()=>{
  const r=selectProvider([{id:'p1',priority:1,health:'OFFLINE',latencyMs:20,errorRate:1},{id:'p2',priority:2,health:'HEALTHY',latencyMs:30,errorRate:0}]);
  expect(r.selected).toBe('p2'); expect(r.mode).toBe('FAILOVER');
 });
 it('blocks quota exhaustion',()=>{
  const r=evaluateQuota({provider:'x',windowMs:60000,maxRequests:10,maxCost:5},{provider:'x',windowMs:60000,requests:10,cost:2});
  expect(r.allowed).toBe(false); expect(r.reason).toBe('REQUEST_LIMIT');
 });
 it('keeps release in shadow and rejects critical failures',()=>{
  const sim=simulateRelease('1.2.3',[{name:'smoke',passed:true,critical:true},{name:'security',passed:false,critical:true}]);
  expect(sim.status).toBe('FAIL'); expect(()=>assertShadowSafe(sim)).toThrow();
 });
 it('certifies only when every production gate is green',()=>{
  const release=simulateRelease('1.2.3',[{name:'smoke',passed:true,critical:true}]);
  const slo=evaluateSLOs([{name:'availability',target:.99,direction:'MIN'}],[{name:'availability',value:1}]);
  const provider=selectProvider([{id:'p1',priority:1,health:'HEALTHY',latencyMs:20,errorRate:0}]);
  const quota=evaluateQuota({provider:'p1',windowMs:60000,maxRequests:10,maxCost:5},{provider:'p1',windowMs:60000,requests:2,cost:1});
  const ok=certifyProduction({slo:sloGate(slo),release,failover:provider,quota,testsPassed:true,securityPassed:true});
  expect(ok.certified).toBe(true); expect(ok.blockers).toEqual([]);
  const denied=certifyProduction({...{slo:sloGate(slo),release,failover:provider,quota,testsPassed:true,securityPassed:true},securityPassed:false});
  expect(denied.certified).toBe(false); expect(denied.blockers).toContain('SECURITY_FAILED');
 });
});
