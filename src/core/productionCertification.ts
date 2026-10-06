import type {SloResult} from './sloObservability';
import type {ProviderRoute} from './providerFailover';
import type {QuotaResult} from './quotaGovernance';
import type {ReleaseSimulationResult} from './releaseSimulation';
export interface CertificationInput { slo:SloResult; provider:ProviderRoute; quota:QuotaResult; release:ReleaseSimulationResult; testsPassed:boolean; securityPassed:boolean; }
export interface CertificationResult { certified:boolean; reasons:string[]; gate:'PASS'|'FAIL'; }
export function certifyProduction(input:CertificationInput):CertificationResult {
 const reasons:string[]=[];
 if(input.slo.status==='BREACHED')reasons.push('SLO_BREACHED');
 if(input.provider.mode==='OFFLINE')reasons.push('PROVIDER_OFFLINE');
 if(input.quota.decision==='BLOCK')reasons.push('QUOTA_BLOCK');
 if(input.release.decision!=='PROMOTE')reasons.push('RELEASE_NOT_PROMOTABLE');
 if(!input.testsPassed)reasons.push('TESTS_FAILED');
 if(!input.securityPassed)reasons.push('SECURITY_FAILED');
 return {certified:reasons.length===0,gate:reasons.length===0?'PASS':'FAIL',reasons};
}