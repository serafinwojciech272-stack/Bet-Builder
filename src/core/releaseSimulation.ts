export type SimulationStatus='PASS'|'REVIEW'|'FAIL';
export interface SimulationCheck { name:string; passed:boolean; critical:boolean; detail?:string; }
export interface ReleaseSimulation { version:string; mode:'SHADOW'; checks:SimulationCheck[]; status:SimulationStatus; }
export function simulateRelease(version:string,checks:SimulationCheck[]):ReleaseSimulation {
 const status=checks.some(x=>!x.passed&&x.critical)?'FAIL':checks.some(x=>!x.passed)?'REVIEW':'PASS';
 return {version,mode:'SHADOW',checks:[...checks],status};
}
export function assertShadowSafe(sim:ReleaseSimulation):void { if(sim.mode!=='SHADOW'||sim.status==='FAIL')throw new Error('SHADOW_RELEASE_NOT_SAFE'); }
