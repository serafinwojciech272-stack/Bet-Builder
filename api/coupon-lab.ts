import { getCouponSnapshot, listCouponSnapshots, saveCouponSnapshot, appendCouponAudit } from '../src/core/couponLabPersistence';
import { pdfBase64 } from '../src/core/couponLabPdf';
import { buildCouponExplanation, assessCouponRisk, buildVariants, type CouponSnapshot } from '../src/core/couponLabDomain';
import { replaceLegInContext, findSimilarLegs } from '../src/core/couponLabDomain';
import type { CouponResult } from '../src/core/couponEngine';

type Req={method?:string;body?:any;query:Record<string,string>}; type Res={status:(n:number)=>Res;json:(x:unknown)=>void};
const id=()=>`cp_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
export default async function handler(req:Req,res:Res){
  try{
    if(req.method==='GET'){
      if(req.query.id){const snapshot=await getCouponSnapshot(req.query.id);return res.status(snapshot?200:404).json(snapshot??{error:'COUPON_NOT_FOUND'});}
      return res.status(200).json({items:await listCouponSnapshots()});
    }
    if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
    const body=req.body??{};
    if(body.action==='pdf'){
      const snapshot=await getCouponSnapshot(String(body.id)); if(!snapshot)return res.status(404).json({error:'COUPON_NOT_FOUND'});
      return res.status(200).json({status:'READY',artifactId:`pdf_${snapshot.id}`,contentType:'application/pdf',base64:pdfBase64(snapshot)});
    }
    if(body.action==='save'){
      const coupon=body.coupon as CouponResult; const certification=body.certification;
      const snapshot:CouponSnapshot={id:id(),schemaVersion:1,createdAt:new Date().toISOString(),targetOdds:coupon.targetOdds,stake:coupon.stake,sport:String(body.sport??'all'),selectedVariant:'AI_SELECTED',coupon,explanation:buildCouponExplanation(coupon),risk:assessCouponRisk(coupon),provenance:body.provenance??{},certification:certification??{},pdf:{status:'GENERATING'},approvalState:'PENDING',executionPolicy:'OBSERVATIONAL_ONLY',auditEvents:[{id:id(),type:'COUPON_CREATED',at:new Date().toISOString(),actor:'SYSTEM',payload:{targetOdds:coupon.targetOdds,legs:coupon.legs.length}}]};
      const saved=await saveCouponSnapshot(snapshot); return res.status(200).json({...snapshot,persistence:saved});
    }
    if(body.action==='feedback'){
      const snapshot=await appendCouponAudit(String(body.id),{id:id(),type:'FEEDBACK_RECORDED',at:new Date().toISOString(),actor:'USER',payload:{helpful:Boolean(body.helpful),reason:body.reason?String(body.reason):null}});
      return res.status(200).json(snapshot);
    }
    if(body.action==='audit'){
      const snapshot=await appendCouponAudit(String(body.id),body.event); return res.status(200).json(snapshot);
    }
    return res.status(400).json({error:'UNKNOWN_ACTION'});
  }catch(error){return res.status(500).json({error:error instanceof Error?error.message:'COUPON_LAB_FAILED'});}
}
