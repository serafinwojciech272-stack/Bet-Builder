export interface ModelDeployment { modelId:string; deployedAt:string; status:'ACTIVE'|'RETIRED'; }
export function rollbackModel(active:ModelDeployment,previous:ModelDeployment,reason:string):ModelDeployment {
 if(active.status!=='ACTIVE') throw new Error('ACTIVE_MODEL_REQUIRED');
 if(previous.status!=='RETIRED') throw new Error('ROLLBACK_TARGET_NOT_RETIRED');
 if(!reason.trim()) throw new Error('ROLLBACK_REASON_REQUIRED');
 if(Number.isNaN(Date.parse(active.deployedAt))||Number.isNaN(Date.parse(previous.deployedAt))) throw new Error('MODEL_TIMESTAMP_INVALID');
 return {...previous,status:'ACTIVE'};
}