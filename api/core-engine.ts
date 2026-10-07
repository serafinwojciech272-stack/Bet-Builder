import type { VercelRequest, VercelResponse } from '@vercel/node';

const DEFAULT_CORE_ENGINE_URL = 'https://core-engine-34uu.onrender.com';
type Action = 'capabilities'|'intelligence'|'analyze'|'submit'|'execute'|'measure'|'complete'|'learn';
function json(res: VercelResponse,status:number,body:unknown){res.status(status).setHeader('Content-Type','application/json; charset=utf-8').setHeader('Cache-Control','no-store').json(body);}
async function upstream(path:string,init:RequestInit={}){const base=(process.env.CORE_ENGINE_URL||DEFAULT_CORE_ENGINE_URL).replace(/\/$/,'');const key=process.env.CORE_ENGINE_API_KEY?.trim();if(!key)throw Object.assign(new Error('CORE_ENGINE_NOT_CONFIGURED'),{code:'CORE_ENGINE_NOT_CONFIGURED'});const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);try{return await fetch(base+path,{...init,cache:'no-store',signal:controller.signal,headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','x-core-engine-client':'bet-builder',...(init.headers||{})}})}finally{clearTimeout(timer);}}
export default async function handler(req:VercelRequest,res:VercelResponse){
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method==='GET'){try{const r=await upstream('/api/engine');return json(res,r.status,await r.json());}catch(e){return json(res,503,{ok:false,error:e instanceof Error?e.message:'CORE_ENGINE_UNAVAILABLE'});}}
  if(req.method!=='POST')return json(res,405,{error:'METHOD_NOT_ALLOWED'});
  const body=(req.body&&typeof req.body==='object'?req.body:{}) as Record<string,unknown>;const action=String(body.action||'') as Action;
  try{
    if(action==='capabilities'){const r=await upstream('/api/engine');return json(res,r.status,await r.json());}
    if(action==='intelligence'){const r=await upstream('/api/model-intelligence');return json(res,r.status,await r.json());}
    if(action==='analyze'){
      const task=String(body.task||'').trim();if(!task)return json(res,400,{error:'TASK_REQUIRED'});
      const r=await upstream('/api/integrations',{method:'POST',body:JSON.stringify({task,context:body.context||'',capabilities:['sports-analysis','risk-analysis','reasoning','verification'],approvalPolicy:'HUMAN_APPROVAL_REQUIRED'})});
      return json(res,r.status,await r.json());
    }
    if(action==='submit'){
      const mission=body.mission as Record<string,unknown>|undefined;if(!mission)return json(res,400,{error:'MISSION_REQUIRED'});
      const target=mission.target as Record<string,unknown>|undefined;const objective=String(mission.objective||'Observe sports market conditions');
      const signals=[{name:'event',value:String(target?.eventLabel||target?.eventId||'unknown'),source:'bet-builder'},{name:'market',value:String(target?.marketLabel||target?.market||'unknown'),source:'bet-builder'},{name:'objective',value:objective.slice(0,200),source:'bet-builder'},{name:'risk',value:String((mission.risk as Record<string,unknown>|undefined)?.level||'UNKNOWN'),source:'bet-builder'}];
      const r=await upstream('/api/engine',{method:'POST',body:JSON.stringify({signals,domain:'trading'})});return json(res,r.status,await r.json());
    }
    const engineRef=String(body.engineRef||'').trim();if(!engineRef)return json(res,400,{error:'ENGINE_REF_REQUIRED'});
    const outcome=body.outcome&&typeof body.outcome==='object'?body.outcome:undefined;const idempotencyKey=`bet-builder:${engineRef}:${action}`;
    const r=await upstream('/api/mission',{method:'POST',body:JSON.stringify({id:engineRef,action,idempotencyKey,outcome})});return json(res,r.status,await r.json());
  }catch(e){const error=e instanceof Error?e.message:'CORE_ENGINE_UNAVAILABLE';return json(res,503,{ok:false,error:error.includes('CORE_ENGINE_NOT_CONFIGURED')?'CORE_ENGINE_NOT_CONFIGURED':'CORE_ENGINE_UNAVAILABLE'});}
}