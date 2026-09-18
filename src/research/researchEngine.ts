import type { EventResearch, ResearchFinding, ResearchLanguage, ResearchQuery, ResearchSource } from './types';

const LANGUAGE_TERMS: Record<ResearchLanguage, { lineup: string; injury: string; preview: string; tactics: string; tipster: string }> = {
  en: { lineup: 'lineup injuries starting XI team news', injury: 'injury suspension unavailable', preview: 'match preview form tactical preview', tactics: 'tactics expected lineup formation', tipster: 'prediction betting tips tipster odds' },
  de: { lineup: 'Aufstellung Verletzungen Startelf Team-News', injury: 'Verletzung Sperre Ausfall nicht dabei', preview: 'Vorschau Form Spielanalyse', tactics: 'Taktik voraussichtliche Aufstellung System', tipster: 'Prognose Wett-Tipp Tipps Vorhersage' },
  pl: { lineup: 'skład kontuzje wyjściowa jedenastka kadra', injury: 'kontuzja zawieszenie absencja nie zagra', preview: 'zapowiedź forma analiza meczu', tactics: 'taktyka przewidywany skład ustawienie', tipster: 'typy bukmacherskie typy mecz prognoza' },
  it: { lineup: 'formazione infortuni probabile undici', injury: 'infortunio squalifica assente', preview: 'anteprima forma analisi partita', tactics: 'tattica probabile formazione', tipster: 'pronostico scommesse tip' },
  es: { lineup: 'alineación lesiones once titular', injury: 'lesión sanción baja', preview: 'previa forma análisis partido', tactics: 'táctica alineación probable', tipster: 'pronóstico apuestas tips' },
  fr: { lineup: 'composition blessures onze probable', injury: 'blessure suspension absent', preview: 'avant match forme analyse', tactics: 'tactique composition probable', tipster: 'pronostic paris conseils' },
  nl: { lineup: 'opstelling blessures basiselftal', injury: 'blessure schorsing afwezig', preview: 'voorbeschouwing vorm analyse', tactics: 'tactiek vermoedelijke opstelling', tipster: 'voorspelling wedtips' },
};

const clamp = (n:number) => Math.max(0, Math.min(1, n));
const hash = (s:string) => { let h=2166136261; for(const c of s){h^=c.charCodeAt(0); h=Math.imul(h,16777619);} return (h>>>0).toString(16); };

export function buildResearchQueries(home:string, away:string, sport:string, league:string): ResearchQuery[] {
  const pairs: Array<[ResearchLanguage, keyof typeof LANGUAGE_TERMS]> = [
    ['pl','lineup'],['pl','preview'],['en','lineup'],['en','preview'],['en','tipster'],
    ['de','lineup'],['de','preview'],['de','tipster'],['de','tactics'],['it','preview'],
    ['es','preview'],['fr','preview'],['nl','preview'],
  ];
  return pairs.map(([language,purpose]) => {
    const t=LANGUAGE_TERMS[language][purpose];
    const q=purpose==='tipster'
      ? `"${home}" "${away}" ${t}`
      : `"${home}" "${away}" ${t} ${sport} ${league}`;
    return { language, query:q, purpose: purpose==='lineup'?'lineup':purpose==='preview'?'preview':purpose==='tactics'?'tactics':'tipster-consensus' };
  });
}

function classify(title:string, snippet:string): ResearchSourceKind {
  const s=(title+' '+snippet).toLowerCase();
  if(/official|club statement|press conference|federation/.test(s)) return 'official';
  if(/tip|prediction|betting|wette|tipp|prognose|pronostico|paris/.test(s)) return 'tipster';
  if(/forum|reddit|fan|supporter|kibic/.test(s)) return 'community';
  if(/preview|vorschau|analysis|analyse|tactical|taktik|form/.test(s)) return 'expert';
  return 'local-media';
}

function reliability(kind:ResearchSourceKind, publisher:string): 'A'|'B'|'C'|'D' {
  if(kind==='official') return 'A';
  if(kind==='expert') return 'B';
  if(kind==='local-media') return 'B';
  if(kind==='community') return 'C';
  return 'C';
}

export function normalizeResearchSources(items:Array<{url:string;title:string;publisher:string;language:ResearchLanguage;publishedAt?:string|null;snippet?:string}>): ResearchSource[] {
  return items.map((x,i)=>{
    const kind=classify(x.title,x.snippet??'');
    const snippet=x.snippet??'';
    const terms=(snippet+' '+x.title).match(/lineup|aufstellung|skład|injur|verletz|kontuz|absenc|suspens|taktik|tactic|forma|form|prediction|tip|tipp|prognos/gi)??[];
    return { url:x.url,title:x.title,publisher:x.publisher,language:x.language,kind,reliability:reliability(kind,x.publisher),publishedAt:x.publishedAt??null,snippet,matchedTerms:[...new Set(terms.map(t=>t.toLowerCase()))] };
  }).slice(0,120);
}

export function synthesizeResearch(eventId:string, queries:ResearchQuery[], sources:ResearchSource[], now=new Date()): EventResearch {
  const findings:ResearchFinding[]=[];
  const grouped=new Map<string,ResearchSource[]>();
  for(const s of sources){
    const key=s.matchedTerms.some(t=>/lineup|aufstellung|skład|start|eleven/.test(t))?'lineup':s.matchedTerms.some(t=>/injur|verletz|kontuz|absenc|suspens/.test(t))?'injury':s.matchedTerms.some(t=>/taktik|tactic/.test(t))?'tactics':s.matchedTerms.some(t=>/form|forma/.test(t))?'form':'preview';
    grouped.set(key,[...(grouped.get(key)??[]),s]);
  }
  for(const [category,ss] of grouped){
    const supportive=ss.filter(s=>/positive|expected|available|fit|strong|good|favor|voraussicht|form/.test((s.title+' '+s.snippet).toLowerCase())).length;
    const adverse=ss.filter(s=>/injur|out|suspend|doubt|missing|schwach|ausfall|verletzt|kontuz|absenc/.test((s.title+' '+s.snippet).toLowerCase())).length;
    const polarity=supportive>adverse?'supportive':adverse>supportive?'adverse':'neutral';
    findings.push({id:`RF-${hash(eventId+category+ss.map(s=>s.url).join('|'))}`,category:category as ResearchFinding['category'],statement:`${category} evidence aggregated from ${ss.length} source(s); signal is ${polarity}.`,polarity,confidence:clamp(.35+Math.min(.5,ss.length*.08)+(new Set(ss.map(s=>s.publisher)).size>1?.12:0)),sourceIds:ss.slice(0,8).map(s=>s.url),freshnessHours:ss.filter(s=>s.publishedAt).length?Math.min(168,...ss.filter(s=>s.publishedAt).map(s=>Math.max(0,(Date.now()-new Date(s.publishedAt!).getTime())/36e5))):168,independentSourceCount:new Set(ss.map(s=>s.publisher)).size});
  }
  const support=findings.filter(f=>f.polarity==='supportive').length, adverse=findings.filter(f=>f.polarity==='adverse').length;
  const direction=support>adverse?'supportive':adverse>support?'adverse':findings.length?'mixed':'insufficient';
  const independent=new Set(sources.map(s=>s.publisher)).size;
  const tipster=sources.filter(s=>s.kind==='tipster').length;
  const official=sources.filter(s=>s.kind==='official').length;
  const localMedia=sources.filter(s=>s.kind==='local-media').length;
  const expert=sources.filter(s=>s.kind==='expert').length;
  const community=sources.filter(s=>s.kind==='community').length;
  const quality=clamp(.2+Math.min(.3,independent*.04)+Math.min(.2,findings.length*.04)+Math.min(.15,official*.05)+Math.min(.1,expert*.025)+Math.min(.05,tipster*.01));
  const warnings:string[]=[];
  if(independent<3) warnings.push('Fewer than three independent publishers found.');
  if(!official) warnings.push('No official-source confirmation found.');
  if(!expert) warnings.push('No expert/local analysis source found.');
  if(tipster && tipster<2) warnings.push('Tipster evidence is sparse; it cannot independently clear the research gate.');
  return {
    researchId:`R-${eventId}-${now.getTime()}`,eventId,generatedAt:now.toISOString(),queries,sources,findings,
    consensus:{direction,score:clamp((support+adverse?Math.abs(support-adverse)/(support+adverse):0)*quality),independentSources:independent,supportingSources:support,adverseSources:adverse,contradictionRate:findings.length?clamp(1-Math.max(support,adverse)/Math.max(1,findings.length)):1},
    sourceCoverage:{languages:[...new Set(sources.map(s=>s.language))],official,localMedia,expert,tipster,community},
    lineupStatus: findings.some(f=>f.category==='lineup'&&f.independentSourceCount>=2)?'probable':findings.some(f=>f.category==='lineup')?'uncertain':'unknown',
    researchQuality:quality,warnings,digest:hash(JSON.stringify({eventId,queries,sources:sources.map(s=>[s.url,s.title,s.publishedAt]),findings})),
  };
}
