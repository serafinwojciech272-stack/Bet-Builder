export type ModelProvider='deterministic'|'openrouter'|'vercel-ai'|'core-engine';
export interface ModelRequest { task:'reason'|'classify'|'summarize'; input:string; context:Record<string,unknown>; }
export interface ModelResponse { provider:ModelProvider; model:string; text:string; confidence:number; degraded:boolean; reason?:string; }
export interface ModelAdapter { provider:ModelProvider; model:string; available():Promise<boolean>; run(request:ModelRequest):Promise<ModelResponse>; }

export class DecisionModelRouter {
 constructor(private readonly adapters:ModelAdapter[], private readonly fallback:ModelAdapter){}
 async run(request:ModelRequest):Promise<ModelResponse>{
  for(const adapter of this.adapters){
   try{if(await adapter.available()) return await adapter.run(request);}catch{ /* try next provider */ }
  }
  const response=await this.fallback.run(request);
  return {...response,degraded:true,reason:response.reason??'No configured external model provider was available.'};
 }
}

export const deterministicReasoningAdapter:ModelAdapter={
 provider:'deterministic',model:'decision-rule-engine-1.0',async available(){return true},
 async run(request){
  const blockers=Array.isArray(request.context.blockers)?request.context.blockers as string[]:[];
  const warnings=Array.isArray(request.context.warnings)?request.context.warnings as string[]:[];
  const text=blockers.length?'Decision blocked by '+blockers.length+' explicit gate condition(s).':warnings.length?'Decision requires review; '+warnings.length+' warning(s) remain in the evidence chain.':'Decision evidence is internally consistent; human approval remains mandatory.';
  return {provider:'deterministic',model:'decision-rule-engine-1.0',text,confidence:blockers.length?1:.78,degraded:false};
 }
};


export const deterministicReasoningAdapter:ModelAdapter={
 provider:'deterministic',model:'decision-rule-engine-1.0',async available(){return true},
 async run(request){
  const blockers=Array.isArray(request.context.blockers)?request.context.blockers as string[]:[];
  const warnings=Array.isArray(request.context.warnings)?request.context.warnings as string[]:[];
  const text=blockers.length?'Decision blocked by '+blockers.length+' explicit gate condition(s).':warnings.length?'Decision requires review; '+warnings.length+' warning(s) remain in the evidence chain.':'Decision evidence is internally consistent; human approval remains mandatory.';
  return {provider:'deterministic',model:'decision-rule-engine-1.0',text,confidence:blockers.length?1:.78,degraded:false};
 }
};

export const openRouterReasoningAdapter:ModelAdapter={
 provider:'openrouter',
 model:typeof import.meta!=='undefined' && typeof import.meta.env!=='undefined' && typeof import.meta.env.VITE_OPENROUTER_MODEL==='string' && import.meta.env.VITE_OPENROUTER_MODEL ? import.meta.env.VITE_OPENROUTER_MODEL : 'server-configured',
 async available(){
  try{
   const response=await fetch('/api/decision-reasoning',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({probe:true,decision:{status:'BLOCKED',ev:0,confidence:0,quality:0,blockers:['probe'],warnings:[],strengths:[],trace:[]},evidence:{digest:'probe',coverage:0,conflicts:0,nodes:[]}}});
   return response.status!==503;
  }catch{return false;}
 },
 async run(request){
  const response=await fetch('/api/decision-reasoning',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({task:'reason',decision:{status:request.context.status,ev:request.context.ev,confidence:request.context.confidence,quality:request.context.quality,blockers:request.context.blockers,warnings:request.context.warnings,strengths:request.context.strengths,trace:request.context.trace},evidence:request.context.evidence})});
  if(!response.ok) throw new Error('OPENROUTER_REASONING_'+response.status);
  const data=await response.json() as {provider:ModelProvider;model:string;synthesis:string;stance:string;factors:string[];uncertainties:string[];degraded:boolean};
  return {provider:data.provider??'openrouter',model:data.model??'server-configured',text:data.synthesis,confidence:request.context.status==='BLOCKED'?1:.82,degraded:Boolean(data.degraded),reason:JSON.stringify({stance:data.stance,factors:data.factors,uncertainties:data.uncertainties})};
 }
};