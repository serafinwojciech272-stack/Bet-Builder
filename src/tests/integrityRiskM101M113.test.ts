import {describe,expect,it} from 'vitest';
import {detectModelDrift} from '../core/modelDrift';
import {evaluateFreshness} from '../core/dataFreshnessSla';
import {reconcileProviderQuotes} from '../core/providerReconciliation';
import {proportionSignificance,meanSignificance} from '../core/statisticalSignificance';
import {wilsonInterval,meanInterval} from '../core/confidenceIntervals';
import {runStressTest} from '../core/stressTesting';
import {buildPortfolioCorrelation} from '../core/portfolioCorrelation';
import {aggregateExposure} from '../core/exposureAggregation';

describe('M106 drift',()=>it('classifies PSI drift',()=>{expect(detectModelDrift([{feature:'x',baseline:[.5,.5],current:[.9,.1]}])[0].severity).toBe('HIGH');}));
describe('M107 freshness',()=>it('flags stale data',()=>{const r=evaluateFreshness({source:'a',maxAgeSeconds:60,criticalAgeSeconds:300},{source:'a',observedAt:'2026-01-01T11:58:00Z',now:'2026-01-01T12:00:00Z'});expect(r.status).toBe('STALE');expect(r.withinSla).toBe(false);}));
describe('M108 reconciliation',()=>it('finds quote discrepancy',()=>{const r=reconcileProviderQuotes([{provider:'a',eventId:'e',selectionId:'s',odds:2,capturedAt:'2026-01-01T11:00:00Z'},{provider:'b',eventId:'e',selectionId:'s',odds:2.2,capturedAt:'2026-01-01T11:00:10Z'}]);expect(r[0].status).toBe('DISCREPANCY');}));
describe('M109 significance',()=>it('returns finite significance outputs',()=>{const p=proportionSignificance(70,100,.5);const m=meanSignificance([1,2,3,4,5],0);expect(Number.isFinite(p.pValueApprox)).toBe(true);expect(m.pValueApprox).toBeLessThan(.05);}));
describe('M110 intervals',()=>it('bounds a binary estimate and mean interval',()=>{const w=wilsonInterval(50,100);const m=meanInterval([1,2,3,4,5]);expect(w.lower).toBeLessThan(.5);expect(w.upper).toBeGreaterThan(.5);expect(m.lower).toBeLessThan(m.estimate);expect(m.upper).toBeGreaterThan(m.estimate);}));
describe('M111 stress',()=>it('detects breach under adverse scenario',()=>{const r=runStressTest([{id:'a',baseValue:100,probability:.5}], [{name:'shock',probabilityDelta:.4,valueMultiplier:1}],80);expect(r[0].breach).toBe(true);}));
describe('M112 correlation',()=>it('identifies same-event concentration',()=>{const r=buildPortfolioCorrelation([{id:'a',eventId:'e',marketId:'m1',selectionId:'s1',value:10},{id:'b',eventId:'e',marketId:'m2',selectionId:'s2',value:10}]);expect(r[0].coefficient).toBe(1);}));
describe('M113 exposure',()=>it('aggregates event concentration',()=>{const r=aggregateExposure([{id:'a',eventId:'e',marketId:'m',stake:60,maxLoss:60},{id:'b',eventId:'f',marketId:'m2',stake:40,maxLoss:40}]);expect(r.totalStake).toBe(100);expect(r.buckets[0].concentrationPct).toBeCloseTo(.6);}));
