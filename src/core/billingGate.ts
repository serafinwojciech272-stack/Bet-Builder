import type {PlanId} from './monetization';import type {BillingEvent,EntitlementGrant} from './commercialContracts';
export interface VerifiedWebhook {providerEventId:string;signatureValid:boolean;event:BillingEvent;}
export function acceptBillingWebhook(input:VerifiedWebhook,seenProviderEventIds:Set<string>){
 if(!input.signatureValid)return {accepted:false,reason:'INVALID_SIGNATURE' as const};
 if(!input.providerEventId||input.event.providerEventId!==input.providerEventId)return {accepted:false,reason:'EVENT_ID_MISMATCH' as const};
 if(seenProviderEventIds.has(input.providerEventId))return {accepted:false,reason:'DUPLICATE_EVENT' as const};
 seenProviderEventIds.add(input.providerEventId);return {accepted:true,reason:'ACCEPTED' as const};
}
export function grantEntitlement(event:BillingEvent,now:string):EntitlementGrant {
 const plan=(event.productId.includes('quant')?'QUANT':event.productId.includes('analyst')?'ANALYST':event.productId.includes('founder')?'FOUNDER':event.productId.includes('pro')||event.productId.includes('day-pass')||event.productId.includes('season-pass')?'PRO':'FREE') as PlanId;
 const oneTime=event.productId==='founder-pass'||event.productId==='day-pass'||event.productId==='season-pass';const days=event.productId==='founder-pass'?365:event.productId==='day-pass'?1:event.productId==='season-pass'?120:null;
 const state=event.type==='PAYMENT_FAILED'?'PAST_DUE':event.type==='SUBSCRIPTION_CANCELLED'?'CANCELLED':event.type==='REFUND'?'EXPIRED':'ACTIVE';
 return {customerId:event.customerId,plan:plan as EntitlementGrant['plan'],sourceProductId:event.productId,startsAt:now,endsAt:oneTime&&days?new Date(Date.parse(now)+days*86400000).toISOString():state==='ACTIVE'?null:now,state};
}