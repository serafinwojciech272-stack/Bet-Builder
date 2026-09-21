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
