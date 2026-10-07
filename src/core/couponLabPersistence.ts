import type { CouponSnapshot } from './couponLabDomain';

type Config={url:string;serviceRoleKey:string};
const memory=new Map<string,CouponSnapshot>();
const config=():Config|null=>{const url=process.env.SUPABASE_URL?.trim(),serviceRoleKey=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();return url&&serviceRoleKey?{url,serviceRoleKey}:null};
const endpoint=(c:Config)=>(c.url.endsWith('/')?c.url.slice(0,-1):c.url)+'/rest/v1/bb_coupon_snapshots';
export async function saveCouponSnapshot(snapshot:CouponSnapshot){
  const c=config();
  if(!c){memory.set(snapshot.id,snapshot);return {backend:'MEMORY' as const,id:snapshot.id};}
  const r=await fetch(endpoint(c),{method:'POST',headers:{apikey:c.serviceRoleKey,Authorization:`Bearer ${c.serviceRoleKey}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({id:snapshot.id,created_at:snapshot.createdAt,snapshot})});
  if(!r.ok) throw new Error(`COUPON_PERSISTENCE_FAILED:${r.status}:${(await r.text()).slice(0,240)}`);
  return {backend:'SUPABASE' as const,id:snapshot.id};
}
export async function getCouponSnapshot(id:string){
  const c=config();
  if(!c)return memory.get(id)??null;
  const r=await fetch(endpoint(c)+`?select=snapshot&id=eq.${encodeURIComponent(id)}`,{headers:{apikey:c.serviceRoleKey,Authorization:`Bearer ${c.serviceRoleKey}`}});
  if(!r.ok)throw new Error(`COUPON_READ_FAILED:${r.status}`);
  const rows=await r.json() as Array<{snapshot:CouponSnapshot}>;
  return rows[0]?.snapshot??null;
}
export async function listCouponSnapshots(){
  const c=config();
  if(!c)return [...memory.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const r=await fetch(endpoint(c)+'?select=snapshot&order=created_at.desc&limit=100',{headers:{apikey:c.serviceRoleKey,Authorization:`Bearer ${c.serviceRoleKey}`}});
  if(!r.ok)throw new Error(`COUPON_LIST_FAILED:${r.status}`);
  const rows=await r.json() as Array<{snapshot:CouponSnapshot}>;
  return rows.map(r=>r.snapshot);
}
export async function appendCouponAudit(snapshotId:string,event:CouponSnapshot['auditEvents'][number]){
  const snapshot=await getCouponSnapshot(snapshotId);
  if(!snapshot)throw new Error('COUPON_NOT_FOUND');
  const next={...snapshot,auditEvents:[...snapshot.auditEvents,event]};
  await saveCouponSnapshot(next); return next;
}
