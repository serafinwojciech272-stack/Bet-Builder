import {describe,expect,it} from 'vitest';
import {validateAuditChain,validateReplayStages,validateEvidenceLinks,selectActivePolicy,nextDecisionPacket,openIncident,requiresUserNotice,freshnessRoute,quarantineProvider,attributeCost,withinModelBudget,transparencyReady,publishableMetric,correlationExplanation,uncertaintyBand,riskControlsValid,decisionUiState,prioritizeAlerts,compactDecision,productionReady} from '../core/operationalIntelligenceM126M145';

describe('M126-M145 operational intelligence',()=>{
 it('M126 validates chained audit events',()=>expect(validateAuditChain([{id:'a',sequence:1,payloadHash:'h1'},{id:'b',sequence:2,payloadHash:'h2',previousHash:'h1'}])).toBe(true));
 it('M127 rejects replay order regressions',()=>expect(validateReplayStages(['CONTEXT','DECISION','INTELLIGENCE'])).toBe(false));
 it('M128 validates evidence references',()=>expect(validateEvidenceLinks(['a','b'],[{from:'a',to:'b',kind:'SUPPORTS'}])).toBe(true));
 it('M129 selects newest active policy',()=>expect(selectActivePolicy([{id:'1',version:1,active:true,checksum:'a'},{id:'2',version:2,active:true,checksum:'b'}])?.id).toBe('2'));
 it('M130 increments decision packet version',()=>expect(nextDecisionPacket({id:'x',version:3,createdAt:'2026-01-01',policyVersion:1,evidenceCount:1},{id:'x',createdAt:'2026-01-01',policyVersion:2,evidenceCount:2}).version).toBe(4));
 it('M131 rejects duplicate incidents',()=>expect(()=>openIncident([{id:'x',severity:'WARN',openedAt:'2026-01-01'}],{id:'x',severity:'INFO',openedAt:'2026-01-02'})).toThrow());
 it('M132 notices degradation',()=>expect(requiresUserNotice({provider:'p',mode:'DEGRADED',reason:'latency',at:'2026-01-01'})).toBe(true));
 it('M133 routes freshness',()=>expect(freshnessRoute(90,60,120)).toBe('STALE'));
 it('M134 quarantines provider discrepancy',()=>expect(quarantineProvider(6)).toBe(true));
 it('M135 attributes cost',()=>expect(attributeCost([{provider:'p',requests:10,unitCost:.2}])).toBe(2));
 it('M136 enforces model budget',()=>expect(withinModelBudget(101,100)).toBe(false));
 it('M137 requires complete transparency rows',()=>expect(transparencyReady([{label:'Model',value:'v1',source:'ledger',updatedAt:'2026-01-01'}])).toBe(true));
 it('M138 suppresses under-sampled public metric',()=>expect(publishableMetric({name:'ROI',value:.1,sampleSize:19,minimumSample:20})).toBe(false));
 it('M139 explains correlation',()=>expect(correlationExplanation(.9)).toContain('HIGH'));
 it('M140 maps uncertainty',()=>expect(uncertaintyBand(.9)).toBe('VERY_HIGH'));
 it('M141 validates risk controls',()=>expect(riskControlsValid({maxStake:10,cooldownSeconds:60,lossLimit:100})).toBe(true));
 it('M142 exposes degraded UI state',()=>expect(decisionUiState({loading:false,policy:'CLEAR',provider:'DEGRADED',hasData:true})).toBe('DEGRADED'));
 it('M143 prioritizes critical alerts',()=>expect(prioritizeAlerts([{id:'i',severity:'INFO',freshness:1,confidence:.9},{id:'c',severity:'CRITICAL',freshness:1,confidence:.5}])[0].id).toBe('c'));
 it('M144 clamps compact decision values',()=>expect(compactDecision({title:'x',probability:2,confidence:-1,risk:'INFO',status:'READY'})).toMatchObject({probability:1,confidence:0}));
 it('M145 requires every readiness gate',()=>expect(productionReady({tests:true,security:true,slo:true,provider:true,quota:true,release:true,audit:true,transparency:false})).toBe(false));
});