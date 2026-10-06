export interface ModelVersion {
  id:string;
  createdAt:string;
  status:'CANDIDATE'|'ACTIVE'|'RETIRED';
  parentVersion:string|null;
  trainingSample:number;
  evaluationSample:number;
  evidenceRefs:string[];
  promotedAt?:string;
}

export function validateModelVersion(model:ModelVersion):void {
  if(!model.id||!model.createdAt) throw new Error('MODEL_VERSION_IDENTITY_REQUIRED');
  if(Number.isNaN(Date.parse(model.createdAt))) throw new Error('MODEL_VERSION_TIMESTAMP_INVALID');
  if(model.trainingSample<0||model.evaluationSample<0) throw new Error('MODEL_VERSION_SAMPLE_INVALID');
  if(model.status==='ACTIVE'&&model.evaluationSample<20) throw new Error('MODEL_VERSION_ACTIVE_SAMPLE_TOO_SMALL');
  if(model.status==='ACTIVE'&&!model.evidenceRefs.length) throw new Error('MODEL_VERSION_EVIDENCE_REQUIRED');
}

export function promoteModel(model:ModelVersion, evaluatedSample:number, promotedAt:string):ModelVersion {
  validateModelVersion(model);
  if(evaluatedSample<20) throw new Error('MODEL_PROMOTION_SAMPLE_TOO_SMALL');
  if(!model.evidenceRefs.length) throw new Error('MODEL_PROMOTION_EVIDENCE_REQUIRED');
  if(Number.isNaN(Date.parse(promotedAt))) throw new Error('MODEL_PROMOTION_TIMESTAMP_INVALID');
  return {...model,status:'ACTIVE',evaluationSample:evaluatedSample,promotedAt};
}
