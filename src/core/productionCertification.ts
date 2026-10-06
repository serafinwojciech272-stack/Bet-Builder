import type {SLOStatus} from './sloObservability';
import type {ReleaseSimulation} from './releaseSimulation';
import type {FailoverDecision} from './providerFailover';
import type {QuotaDecision} from './apiQuotaGovernance';
export interface CertificationInput { slo:SLOStatus; release:ReleaseSimulation; failover:FailoverDecision; quota:QuotaDecision; testsPassed:boolean; securityPassed:boolean; }
export interface CertificationResult { certified:boolean; blockers:string[]; evidence:string[]; }
export function certifyProduction(input:CertificationInput):CertificationResult {
 const blockers:string[]=[];
 if(input.slo==='BREACHED')blockers.push('SLO_BREACH');
 if(input.release.status==='FAIL')blockers.push('RELEASE_SIMULATION_FAIL');
 if(input.failover.mode==='NO_PROVIDER')blockers.push('NO_PROVIDER');
 if(!input.quota.allowed)blockers.push('QUOTA_BLOCK');
 if(!input.testsPassed)blockers.push('TESTS_FAILED');
 if(!input.securityPassed)blockers.push('SECURITY_FAILED');
 return {certified:blockers.length===0,blockers,evidence:[`slo=${input.slo}`,`release=${input.release.status}`,`provider=${input.failover.selected??'none'}`,`quota=${input.quota.reason}`]};
}
