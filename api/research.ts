import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildResearchQueries, normalizeResearchSources, synthesizeResearch } from '../src/research/researchEngine.js';
import type { ResearchLanguage } from '../src/research/types.js';

type Lang=ResearchLanguage;
const googleLang:Record<Lang,string>={en:'en',de:'de',pl:'pl',it:'it',es:'es',fr:'fr',nl:'nl'};
const country:Record<Lang,string>={en:'US',de:'DE',pl:'PL',it:'IT',es:'ES',fr:'FR',nl:'NL'};

function xmlDecode(s:string){return s.replace(/<!\[CDATA\[/g,'').replace(/\]\]>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');}
function tag(xml:string,name:string){const m=xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`,'i'));return m?xmlDecode(m[1].replace(/<[^>]+>/g,'')):'';}
async function search(q:string,lang:Lang){const url=`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${googleLang[lang]}&gl=${country[lang]}&ceid=${country[lang]}:${googleLang[lang]}`;const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),5000);try{const res=await fetch(url,{headers:{'user-agent':'BetBuilder-Research/1.0'},signal:controller.signal});if(!res.ok)throw new Error(`RSS_${res.status}`);const xml=await res.text();return xml.split('<item>').slice(1,13).map(item=>({url:tag(item,'link'),title:tag(item,'title'),publisher:tag(item,'source')||'Google News',publishedAt:tag(item,'pubDate')||null,snippet:tag(item,'description')||'',language:lang}));}finally{clearTimeout(timer);}}

export default async function handler(req:VercelRequest,res:VercelResponse){
  const origin = req.headers.origin;
  const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS ?? 'https://bet-builder-preview.vercel.app,https://bet-builder-live.onrender.com').split(',').map((value) => value.trim()).filter(Boolean));
  if(origin && allowedOrigins.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS') return res.status(204).end();
  if(req.method!=='GET')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  const eventId=String(req.query.eventId??'').trim(),home=String(req.query.home??'').trim(),away=String(req.query.away??'').trim(),sport=String(req.query.sport??'soccer').trim(),league=String(req.query.league??'').trim();
  if(!home||!away)return res.status(400).json({error:'home_and_away_required'});
  const queries=buildResearchQueries(home,away,sport,league);
  const settled=await Promise.allSettled(queries.map((q)=>search(q.query,q.language)));
  const raw=settled.flatMap((result)=>result.status==='fulfilled'?result.value:[]);
  const failures=settled.filter((result): result is PromiseRejectedResult=>result.status==='rejected');
  const unique=[...new Map(raw.filter(x=>x.url).map(x=>[x.url,x])).values()].slice(0,120);
  const sources=normalizeResearchSources(unique);
  if(!sources.length){
    return res.status(503).json({error:'RESEARCH_PROVIDER_UNAVAILABLE',status:'RESEARCH_PROVIDER_ERROR',queriesAttempted:queries.length,failedQueries:failures.length});
  }
  const research=synthesizeResearch(eventId||`${home}-${away}`,queries,sources);
  return res.status(200).json({...research,researchStatus:failures.length?'RESEARCH_PARTIAL':'RESEARCH_AVAILABLE',failedQueries:failures.length,queriesAttempted:queries.length});
}