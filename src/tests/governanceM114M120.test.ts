import {describe,expect,it} from 'vitest';
import {compareChampionChallenger} from '../core/championChallenger';
import {evaluatePromotion} from '../core/modelPromotionGate';
import {rollbackModel} from '../core/modelRollback';
import {buildFeatureProvenanceGraph} from '../core/featureProvenance';
import {buildEvidenceGraph} from '../core/evidenceGraph';
import {replayDecision} from '../core/decisionReplay';
import {appendPredictionAudit} from '../core/predictionAuditLedger';

const c={modelId:'champion',sampleSize:100,brier:.18,logLoss:.5,roi:.08,clv:.04};
const h={modelId:'challenger',sampleSize:100,brier:.16,logLoss:.45,roi:.1,clv:.05};
describe('M114-M120 governance',()=>{
 it('evaluates challenger against champion',()=>expect(compareChampionChallenger(c,h).eligible).toBe(true));
 it('blocks promotion below minimum sample',()=>expect(evaluatePromotion(c,{...h,sampleSize:10}).decision).toBe('BLOCK'));
 it('rolls back only to an explicit retired target',()=>expect(rollbackModel({modelId:'new',deployedAt:'2026-01-02T00:00:00Z',status:'ACTIVE'},{modelId:'old',deployedAt:'2026-01-01T00:00:00Z',status:'RETIRED'},'drift').status).toBe('ACTIVE'));
 it('validates provenance and evidence graph references',()=>{expect(buildFeatureProvenanceGraph([{id:'s',type:'SOURCE',ref:'feed'},{id:'f',type:'FEATURE',ref:'form'}],[{from:'s',to:'f',relation:'DERIVED_FROM'}]).edges).toHaveLength(1);expect(buildEvidenceGraph([{id:'d',kind:'DATA',ref:'snapshot',verified:true},{id:'p',kind:'POLICY',ref:'risk',verified:true}],[{from:'d',to:'p',relation:'SUPPORTS'}]).links).toHaveLength(1)});
 it('replays ordered immutable events',()=>expect(replayDecision([{sequence:1,stage:'CONTEXT',timestamp:'2026-01-01T00:00:00Z',payloadHash:'a'},{sequence:2,stage:'DECISION',timestamp:'2026-01-01T00:01:00Z',payloadHash:'b'}]).valid).toBe(true));
 it('appends audit events exactly once',()=>{const e={id:'a1',predictionId:'p1',stage:'PREDICTION',occurredAt:'2026-01-01T00:00:00Z',actor:'engine',payloadHash:'x'};expect(appendPredictionAudit([],e)).toHaveLength(1);expect(()=>appendPredictionAudit([e],e)).toThrow('AUDIT_EVENT_DUPLICATE')});
});