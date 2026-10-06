export interface PredictionAuditEvent { id:string; predictionId:string; stage:string; occurredAt:string; actor:string; payloadHash:string; }
export function appendPredictionAudit(ledger:PredictionAuditEvent[],event:PredictionAuditEvent):PredictionAuditEvent[] {
 if(!event.id||!event.predictionId||!event.actor||!event.payloadHash) throw new Error('AUDIT_EVENT_IDENTITY_REQUIRED');
 if(Number.isNaN(Date.parse(event.occurredAt))) throw new Error('AUDIT_EVENT_TIMESTAMP_INVALID');
 if(ledger.some(e=>e.id===event.id)) throw new Error('AUDIT_EVENT_DUPLICATE');
 return [...ledger,event];
}