import type { VercelRequest, VercelResponse } from '@vercel/node';

type Lang='en'|'de'|'pl'|'it'|'es'|'fr'|'nl';
const googleLang:Record<Lang,string>={en:'en',de:'de',pl:'pl',it:'it',es:'es',fr:'fr',nl:'nl'};
const country:Record<Lang,string>={en:'US',de:'DE',pl:'PL',it:'IT',es:'ES',fr:'FR',nl:'NL'};

function xmlDecode(s:string){return s.replace(/<!\[CDATA\[/g,'').replace(/\]\]>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');}
function tag(xml:string,name:string){const m=xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`,'i'));return m?xmlDecode(m[1].replace(/<[^>]+>/g,'')):'';}
async function search(q:string,lang:Lang){const url=`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${googleLang[lang]}&gl=${country[lang]}&ceid=${country[lang]}:${googleLang[lang]}`;const res=await fetch(url,{headers:{'user-agent':'BetBuilder-Research/1.0'}});if(!res.ok)throw new Error(`RSS_${res.status}`);const xml=await res.text();const items=xml.split('<item>').slice(1,13);return items.map((item)=>({url:tag(item,'link'),title:tag(item,'title'),publisher:tag(item,'source')||'Google News',publishedAt:tag(item,'pubDate')||null,snippet:tag(item,'description')||''}));}

export default async function handler(req:VercelRequest,res:VercelResponse){
  if(req.method!=='GET') return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  const home=String(req.query.home??'').trim(), away=String(req.query.away??'').trim(), sport=String(req.query.sport??'soccer').trim(), league=String(req.query.league??'').trim();
  if(!home||!away) return res.status(400).json({error:'home_and_away_required'});
  const langs:Lang[]=['pl','en','de','it','es','fr','nl'];
  const terms:Record<Lang,string>={pl:'skład kontuzje absencje forma taktyka zapowiedź',en:'lineup injuries team news form tactics preview',de:'Aufstellung Verletzungen Ausfälle Form Taktik Vorschau',it:'formazione infortuni forma tattica',es:'alineación lesiones forma táctica',fr:'composition blessures forme tactique',nl:'opstelling blessures vorm tactiek'};
  const tip:Record<Lang,string>={pl:'typy prognoza',en:'prediction betting tips',de:'Wett-Tipp Prognose',it:'pronostico scommesse',es:'pronóstico apuestas',fr:'pronostic paris',nl:'voorspelling wedtips'};
  const all=[];
  for(const lang of langs){
    for(const q of [`"${home}" "${away}" ${terms[lang]} ${sport} ${league}`,`"${home}" "${away}" ${tip[lang]}`]){
      try{all.push(...await search(q,lang));}catch{}
    }
  }
  const unique=[...new Map(all.filter(x=>x.url).map(x=>[x.url,x])).values()].slice(0,100);
  return res.status(200).json({event:{home,away,sport,league},sources:unique,sourceCount:unique.length,languages:langs});
}
