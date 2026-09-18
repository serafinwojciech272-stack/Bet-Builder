export type Lang = 'pl' | 'en' | 'de';
export const LANGS: Array<{id:Lang;label:string}> = [{id:'pl',label:'PL'},{id:'en',label:'EN'},{id:'de',label:'DE'}];

const EN_PL: Record<string,string> = {
  'Mecze':'Matches','Kupon':'Coupon','Analiza':'Analysis','Misje':'Missions','Historia':'History',
  'Wydarzenia sportowe':'Sport events','Szukaj drużyny lub ligi':'Search team or league','Data':'Date','Dyscyplina':'Sport','Sortuj':'Sort',
  'Wszystkie':'All','Wszystkie sporty':'All sports','Godzina':'Time','Wartość':'Value','Ruch kursu':'Odds movement','Tylko monitorowane':'Monitored only',
  'NA ŻYWO':'LIVE','NADCHODZĄCE':'UPCOMING','ANALIZA GOTOWA':'ANALYSIS READY','Najlepszy kurs':'Best odds','Ryzyko':'Risk',
  'NISKIE':'LOW','PODWYŻSZONE':'ELEVATED','WYSOKIE':'HIGH','KRYTYCZNE':'CRITICAL','Brak wydarzeń dla wybranych filtrów':'No events match the filters',
  'Zmień datę, dyscyplinę albo wyszukiwanie.':'Change the date, sport or search.','Mój kupon':'My coupon','Kupon jest pusty':'Coupon is empty',
  'GENERUJ KUPON':'GENERATE COUPON','Generator kuponu AI':'AI coupon generator','Znajdź najlepszy kupon':'Find the best coupon',
  'Liczba zdarzeń':'Number of events','Kurs łączny':'Combined odds','Stawka':'Stake','Pokaż szczegóły AI, ryzyka i Decision Center':'Show AI, risk and Decision Center details',
  'Ukryj szczegóły techniczne':'Hide technical details','Pokaż szczegóły techniczne':'Show technical details','Odśwież dane':'Refresh data',
  'Inteligencja sportowa':'Sports intelligence','Dane demonstracyjne':'Demo data','Prawdziwe dane':'Live data','Nadchodzące mecze':'Upcoming matches'
};
const EN_DE: Record<string,string> = {
  'Mecze':'Spiele','Kupon':'Wettschein','Analiza':'Analyse','Misje':'Missionen','Historia':'Historie',
  'Wydarzenia sportowe':'Sportereignisse','Szukaj drużyny lub ligi':'Team oder Liga suchen','Data':'Datum','Dyscyplina':'Sport','Sortuj':'Sortieren',
  'Wszystkie':'Alle','Wszystkie sporty':'Alle Sportarten','Godzina':'Zeit','Wartość':'Wert','Ruch kursu':'Quotenbewegung','Tylko monitorowane':'Nur überwachte',
  'NA ŻYWO':'LIVE','NADCHODZĄCE':'KOMMEND','ANALIZA GOTOWA':'ANALYSE BEREIT','Najlepszy kurs':'Beste Quote','Ryzyko':'Risiko',
  'NISKIE':'NIEDRIG','PODWYŻSZONE':'ERHÖHT','WYSOKIE':'HOCH','KRYTYCZNE':'KRITISCH','Brak wydarzeń dla wybranych filtrów':'Keine passenden Ereignisse',
  'Zmień datę, dyscyplinę albo wyszukiwanie.':'Datum, Sport oder Suche ändern.','Mój kupon':'Mein Wettschein','Kupon jest pusty':'Wettschein ist leer',
  'GENERUJ KUPON':'WETTSCHEIN GENERIEREN','Generator kuponu AI':'KI-Wettscheingenerator','Znajdź najlepszy kupon':'Besten Wettschein finden',
  'Liczba zdarzeń':'Anzahl Ereignisse','Kurs łączny':'Gesamtquote','Stawka':'Einsatz','Pokaż szczegóły AI, ryzyka i Decision Center':'KI-, Risiko- und Decision-Center-Details anzeigen',
  'Ukryj szczegóły techniczne':'Technische Details ausblenden','Pokaż szczegóły techniczne':'Technische Details anzeigen','Odśwież dane':'Daten aktualisieren',
  'Inteligencja sportowa':'Sportintelligenz','Dane demonstracyjne':'Demodaten','Prawdziwe dane':'Live-Daten','Nadchodzące mecze':'Kommende Spiele'
};

const PL_EN: Record<string,string> = Object.fromEntries(Object.entries(EN_PL).map(([pl,en])=>[en,pl]));
const PL_DE: Record<string,string> = Object.fromEntries(Object.entries(EN_DE).map(([pl,de])=>[pl,de]));

function mapFor(lang:Lang){ return lang==='en' ? EN_PL : lang==='de' ? {...PL_DE,...EN_DE} : Object.fromEntries(Object.entries(EN_PL).map(([pl,en])=>[en,pl])); }

export function applyLanguage(lang:Lang){
  document.documentElement.lang=lang;
  document.documentElement.dataset.lang=lang;
  if(lang==='en') return;
  const map=mapFor(lang);
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  const nodes:Text[]=[]; let node:Node|null;
  while((node=walker.nextNode())) nodes.push(node as Text);
  for(const text of nodes){
    const value=text.nodeValue?.trim();
    if(!value || value.length>120) continue;
    const replacement=map[value];
    if(replacement) text.nodeValue=text.nodeValue!.replace(value,replacement);
  }
  document.querySelectorAll<HTMLElement>('[placeholder],[title],[aria-label]').forEach(el=>{
    for(const attr of ['placeholder','title','aria-label']){
      const value=el.getAttribute(attr); if(value && map[value]) el.setAttribute(attr,map[value]);
    }
  });
}

export function installLanguageObserver(lang:Lang){
  applyLanguage(lang);
  const observer=new MutationObserver(()=>applyLanguage(lang));
  observer.observe(document.body,{subtree:true,childList:true,characterData:true});
  return ()=>observer.disconnect();
}
