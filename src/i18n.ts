export type Lang = 'pl' | 'en' | 'de';
export const LANGS: Array<{ id: Lang; label: string }> = [
  { id: 'pl', label: 'PL' },
  { id: 'en', label: 'EN' },
  { id: 'de', label: 'DE' },
];

const EN_PL: Record<string, string> = {
  'Mecze':'Matches','Kupon':'Coupon','Analiza':'Analysis','Misje':'Missions','Historia':'History',
  'Wydarzenia sportowe':'Sport events','Szukaj drużyny lub ligi':'Search team or league','Data':'Date','Dyscyplina':'Sport','Sortuj':'Sort',
  'Wszystkie':'All','Wszystkie sporty':'All sports','Godzina':'Time','Wartość':'Value','Ruch kursu':'Odds movement','Tylko monitorowane':'Monitored only',
  'NA ŻYWO':'LIVE','NADCHODZĄCE':'UPCOMING','ANALIZA GOTOWA':'ANALYSIS READY','Najlepszy kurs':'Best odds','Ryzyko':'Risk',
  'NISKIE':'LOW','PODWYŻSZONE':'ELEVATED','WYSOKIE':'HIGH','KRYTYCZNE':'CRITICAL','Brak wydarzeń dla wybranych filtrów':'No events match the filters',
  'Zmień datę, dyscyplinę albo wyszukiwanie.':'Change the date, sport or search.','Mój kupon':'My coupon','Kupon jest pusty':'Coupon is empty',
  'GENERUJ KUPON':'GENERATE COUPON','Generator kuponu AI':'AI coupon generator','Znajdź najlepszy kupon':'Find the best coupon',
  'Liczba zdarzeń':'Number of events','Kurs łączny':'Combined odds','Stawka':'Stake','Pokaż szczegóły AI, ryzyka i Decision Center':'Show AI, risk and Decision Center details',
  'Ukryj szczegóły techniczne':'Hide technical details','Pokaż szczegóły techniczne':'Show technical details','Odśwież dane':'Refresh data',
  'Inteligencja sportowa':'Sports intelligence','Dane demonstracyjne':'Demo data','Prawdziwe dane':'Live data','Nadchodzące mecze':'Upcoming matches',
  'Brak danych dostawcy dla':'No provider data for'
};
const PL_DE: Record<string, string> = {
  'Mecze':'Spiele','Kupon':'Wettschein','Analiza':'Analyse','Misje':'Missionen','Historia':'Historie',
  'Wydarzenia sportowe':'Sportereignisse','Szukaj drużyny lub ligi':'Team oder Liga suchen','Data':'Datum','Dyscyplina':'Sport','Sortuj':'Sortieren',
  'Wszystkie':'Alle','Wszystkie sporty':'Alle Sportarten','Godzina':'Zeit','Wartość':'Wert','Ruch kursu':'Quotenbewegung','Tylko monitorowane':'Nur überwachte',
  'NA ŻYWO':'LIVE','NADCHODZĄCE':'KOMMEND','ANALIZA GOTOWA':'ANALYSE BEREIT','Najlepszy kurs':'Beste Quote','Ryzyko':'Risiko',
  'NISKIE':'NIEDRIG','PODWYŻSZONE':'ERHÖHT','WYSOKIE':'HOCH','KRYTYCZNE':'KRITISCH','Brak wydarzeń dla wybranych filtrów':'Keine passenden Ereignisse',
  'Zmień datę, dyscyplinę albo wyszukiwanie.':'Datum, Sport oder Suche ändern.','Mój kupon':'Mein Wettschein','Kupon jest pusty':'Wettschein ist leer',
  'GENERUJ KUPON':'WETTSCHEIN GENERIEREN','Generator kuponu AI':'KI-Wettscheingenerator','Znajdź najlepszy kupon':'Besten Wettschein finden',
  'Liczba zdarzeń':'Anzahl Ereignisse','Kurs łączny':'Gesamtquote','Stawka':'Einsatz','Pokaż szczegóły AI, ryzyka i Decision Center':'KI-, Risiko- und Decision-Center-Details anzeigen',
  'Ukryj szczegóły techniczne':'Technische Details ausblenden','Pokaż szczegóły techniczne':'Technische Details anzeigen','Odśwież dane':'Daten aktualisieren',
  'Inteligencja sportowa':'Sportintelligenz','Dane demonstracyjne':'Demodaten','Prawdziwe dane':'Live-Daten','Nadchodzące mecze':'Kommende Spiele',
  'Brak danych dostawcy dla':'Keine Anbieterdaten für'
};
const EN_PL_EXTRA: Record<string,string> = {
'Loading intelligence…':'Ładowanie inteligencji…','Loading Bet Builder intelligence…':'Ładowanie inteligencji Bet Builder…','Application failed to render':'Nie udało się wyświetlić aplikacji','Reload application':'Przeładuj aplikację',
'Live board':'Panel na żywo','Live monitor':'Monitor na żywo','Live now':'Na żywo','Upcoming':'Nadchodzące','Event inventory':'Baza wydarzeń','Snapshots':'Migawki kursów',
'No live events':'Brak wydarzeń na żywo','No provider events':'Brak wydarzeń od dostawcy','Retry live feed':'Ponów pobieranie danych na żywo','Refresh data':'Odśwież dane','Retry':'Ponów',
'Analysis complete':'Analiza zakończona','Analysis failed':'Analiza nie powiodła się','Core optimization failed':'Optymalizacja Core nie powiodła się',
'Mission drafted':'Misja utworzona','Mission approved':'Misja zatwierdzona','Mission rejected':'Misja odrzucona','Mission cancelled':'Misja anulowana','Mission completed':'Misja zakończona','Mission failed':'Misja nie powiodła się','Mission blocked':'Misja zablokowana',
'Analysis history':'Historia analiz','Mission history':'Historia misji','History & calibration':'Historia i kalibracja','No analyses yet':'Brak analiz','No mission history':'Brak historii misji','No missions in this state':'Brak misji w tym stanie',
'Comparison':'Porównanie','Metric':'Metryka','Confidence':'Pewność','Quality':'Jakość','Best edge':'Najlepsza przewaga','Freshness (min)':'Świeżość (min)','Risk score':'Wynik ryzyka','Correlation score':'Wynik korelacji',
'No events':'Brak wydarzeń','Open mission':'Otwórz misję','Search events':'Szukaj wydarzeń','Search':'Szukaj','Private mode':'Tryb prywatny','Decision ready':'Decyzja gotowa','Ready':'Gotowe','Boot':'Uruchamianie','Gated':'Zablokowane bramką',
'No events match the filters':'Brak wydarzeń dla wybranych filtrów','Change the date, sport or search.':'Zmień datę, dyscyplinę albo wyszukiwanie.',
'My coupon':'Mój kupon','Coupon is empty':'Kupon jest pusty','Generate coupon':'Generuj kupon','AI coupon generator':'Generator kuponu AI','Find the best coupon':'Znajdź najlepszy kupon',
'Number of events':'Liczba zdarzeń','Combined odds':'Kurs łączny','Stake':'Stawka','Show technical details':'Pokaż szczegóły techniczne','Hide technical details':'Ukryj szczegóły techniczne',
'System OK':'System OK','Live intelligence':'Inteligencja na żywo','No real-money execution':'bez transakcji za prawdziwe pieniądze','Upcoming matches':'Nadchodzące mecze'
};
const DE_PL_EXTRA: Record<string,string> = {
'Loading intelligence…':'Intelligenz wird geladen…','Loading Bet Builder intelligence…':'Bet-Builder-Intelligenz wird geladen…','Application failed to render':'Anwendung konnte nicht dargestellt werden','Reload application':'Anwendung neu laden',
'Live board':'Live-Übersicht','Live monitor':'Live-Monitor','Live now':'Live','Upcoming':'Kommend','Event inventory':'Ereignisse','Snapshots':'Kurs-Snapshots',
'No live events':'Keine Live-Ereignisse','No provider events':'Keine Anbieterereignisse','Retry live feed':'Live-Feed erneut laden','Retry':'Erneut versuchen','Refresh data':'Daten aktualisieren',
'Analysis complete':'Analyse abgeschlossen','Analysis failed':'Analyse fehlgeschlagen','Core optimization failed':'Core-Optimierung fehlgeschlagen',
'Mission drafted':'Mission erstellt','Mission approved':'Mission genehmigt','Mission rejected':'Mission abgelehnt','Mission cancelled':'Mission abgebrochen','Mission completed':'Mission abgeschlossen','Mission failed':'Mission fehlgeschlagen','Mission blocked':'Mission blockiert',
'Analysis history':'Analysehistorie','Mission history':'Missionshistorie','History & calibration':'Historie & Kalibrierung','No analyses yet':'Noch keine Analysen','No mission history':'Keine Missionshistorie','No missions in this state':'Keine Missionen in diesem Status',
'Comparison':'Vergleich','Metric':'Metrik','Confidence':'Konfidenz','Quality':'Qualität','Best edge':'Bester Vorteil','Freshness (min)':'Aktualität (Min.)','Risk score':'Risiko-Score','Correlation score':'Korrelations-Score',
'No events':'Keine Ereignisse','Open mission':'Mission öffnen','Search events':'Ereignisse suchen','Search':'Suchen','Private mode':'Privatmodus','Decision ready':'Entscheidung bereit','Ready':'Bereit','Boot':'Start','Gated':'Gesperrt',
'My coupon':'Mein Wettschein','Coupon is empty':'Wettschein ist leer','Generate coupon':'Wettschein generieren','AI coupon generator':'KI-Wettscheingenerator','Find the best coupon':'Besten Wettschein finden','Stake':'Einsatz',
'Number of events':'Anzahl Ereignisse','Combined odds':'Gesamtquote','Show technical details':'Technische Details anzeigen','Hide technical details':'Technische Details ausblenden','System OK':'System OK','Live intelligence':'Live-Intelligenz','No real-money execution':'keine Ausführung mit echtem Geld','Upcoming matches':'Kommende Spiele'
};
const EN_PL_AUDIT: Record<string,string> = {
'AI conclusion':'Wniosek AI','Stance:':'Stanowisko:','Confidence':'Pewność','band:':'pasmo:','Grounded in:':'Podstawa:','Data quality':'Jakość danych','Score':'Wynik','Freshness':'Świeżość','Coverage':'Pokrycie','Completeness':'Kompletność','AI reading':'Odczyt AI','Risk':'Ryzyko','Risk score':'Wynik ryzyka','Correlation':'Korelacja','Cluster score':'Wynik klastra','Independent':'Niezależne','other exposures':'inne ekspozycje','No overlapping exposure detected.':'Nie wykryto nakładających się ekspozycji.','Market movement':'Ruch rynku','raw market data':'surowe dane rynkowe','Selection':'Wybór','Open':'Otwarcie','Now':'Teraz','Books':'Bukmacherzy','Model vs market':'Model vs rynek','Model':'Model','Implied':'Implikowane','Edge':'Przewaga','Best price':'Najlepszy kurs','EV / unit':'EV / jednostkę','Kelly':'Kelly','Key factors':'Kluczowe czynniki','Positive signals':'Pozytywne sygnały','strength':'siła','No supportive signals detected.':'Nie wykryto pozytywnych sygnałów.','No movement history captured yet.':'Nie zarejestrowano jeszcze historii zmian.','Odds movement per selection':'Zmiana kursu dla wyboru','Computed by':'Obliczone przez','AI inference':'Wnioskowanie AI','Deterministic':'Deterministyczne','Measured':'Zmierzono','Stale data':'Nieaktualne dane','Partial data.':'Dane częściowe.','Approve this mission':'Zatwierdź tę misję','Mission lifecycle':'Cykl życia misji','AI Decision Cockpit':'Kokpit decyzji AI','Universal Decision Engine':'Uniwersalny silnik decyzji','MISSION READY':'MISJA GOTOWA','Odds':'Kursy','AI analysis':'Analiza AI','Dashboard':'Panel główny','Sports':'Sporty','Live':'Na żywo','Builder':'Kreator','Home':'Start','Add':'Dodaj','Remove':'Usuń','Prob':'Prawd.','Value':'Wartość','EV':'EV','MOCK ANALYSIS':'ANALIZA TESTOWA','Private mode':'Tryb prywatny','Opportunity Radar':'Radar okazji'
};
const EN_DE_AUDIT: Record<string,string> = {
'AI conclusion':'KI-Fazit','Stance:':'Haltung:','Confidence':'Konfidenz','band:':'Band:','Grounded in:':'Basierend auf:','Data quality':'Datenqualität','Score':'Wert','Freshness':'Aktualität','Coverage':'Abdeckung','Completeness':'Vollständigkeit','AI reading':'KI-Auswertung','Risk':'Risiko','Risk score':'Risiko-Score','Correlation':'Korrelation','Cluster score':'Cluster-Score','Independent':'Unabhängig','other exposures':'andere Expositionen','No overlapping exposure detected.':'Keine überlappende Exposition erkannt.','Market movement':'Marktbewegung','raw market data':'Rohdaten des Marktes','Selection':'Auswahl','Open':'Eröffnung','Now':'Jetzt','Books':'Anbieter','Model vs market':'Modell vs. Markt','Model':'Modell','Implied':'Impliziert','Edge':'Vorteil','Best price':'Beste Quote','EV / unit':'EV / Einheit','Kelly':'Kelly','Key factors':'Schlüsselfaktoren','Positive signals':'Positive Signale','strength':'Stärke','No supportive signals detected.':'Keine positiven Signale erkannt.','No movement history captured yet.':'Noch keine Bewegungsverlauf-Daten erfasst.','Odds movement per selection':'Quotenbewegung je Auswahl','Computed by':'Berechnet von','AI inference':'KI-Inferenz','Deterministic':'Deterministisch','Measured':'Gemessen','Stale data':'Veraltete Daten','Partial data.':'Unvollständige Daten.','Approve this mission':'Mission genehmigen','Mission lifecycle':'Missionszyklus','AI Decision Cockpit':'KI-Entscheidungscockpit','Universal Decision Engine':'Universelle Entscheidungsengine','MISSION READY':'MISSION BEREIT','Odds':'Quoten','AI analysis':'KI-Analyse','Dashboard':'Dashboard','Sports':'Sport','Live':'Live','Builder':'Builder','Home':'Start','Add':'Hinzufügen','Remove':'Entfernen','Prob':'Wahrsch.','Value':'Wert','EV':'EV','MOCK ANALYSIS':'TESTANALYSE','Private mode':'Privatmodus','Opportunity Radar':'Chancen-Radar'
};
const EN_PL_PAGES: Record<string,string> = {
'Selection intelligence':'Inteligencja wyboru','Model prob':'Prawdopodobieństwo modelu','Normalizing provider feed and rebuilding canonical dataset…':'Normalizacja danych dostawcy i przebudowa kanonicznego zbioru…','Live odds unavailable.':'Kursy na żywo niedostępne.','Combined odds':'Kurs łączny','Probability':'Prawdopodobieństwo','READY':'GOTOWE','DATA':'DANE','RESEARCH ALL':'RESEARCH ALL','EVIDENCE ALL':'EVIDENCE ALL','CORRELATION':'KORELACJA','DECISION':'DECYZJA','EV + confidence':'EV + pewność','VALUE':'WARTOŚĆ','LOWER RISK':'NIŻSZE RYZYKO','quality first':'najpierw jakość','Close builder':'Zamknij kreator','Value signals':'Sygnały wartości','Quality alerts':'Alerty jakości','Risk alerts':'Alerty ryzyka','No monitored events':'Brak monitorowanych wydarzeń','feed quality':'jakość danych','Notable odds movements':'Istotne ruchy kursów','No movement captured':'Nie zarejestrowano ruchu','No value signals':'Brak sygnałów wartości','Data-quality alerts':'Alerty jakości danych','Risk surface is calm':'Poziom ryzyka jest spokojny','No missions in flight':'Brak aktywnych misji','No resolved analyses yet':'Brak zakończonych analiz','Loading canonical event…':'Ładowanie kanonicznego wydarzenia…','Event not found in the canonical domain':'Nie znaleziono wydarzenia w domenie kanonicznej','Re-run analysis':'Uruchom analizę ponownie','Run analysis':'Uruchom analizę','Analysis sections':'Sekcje analizy','Event overview':'Przegląd wydarzenia','Market intelligence':'Inteligencja rynku','Odds movement':'Ruch kursów','Model probabilities':'Prawdopodobieństwa modelu','Value analysis':'Analiza wartości','Risk & correlation':'Ryzyko i korelacja','Mission creation':'Tworzenie misji','Retry analysis':'Ponów analizę','No analysis on record':'Brak zapisanej analizy','Mission not found':'Nie znaleziono misji','Event monitor':'Monitor wydarzenia','Mission eligible':'Misja kwalifikuje się','Model at creation':'Model przy utworzeniu','Quality at creation':'Jakość przy utworzeniu','Transition history':'Historia przejść','Mission queue':'Kolejka misji','Mission status':'Status misji','Failed / cancelled':'Nieudane / anulowane','Decision Ledger':'Rejestr decyzji','Live now':'Na żywo','Event inventory':'Baza wydarzeń','upcoming + active':'nadchodzące + aktywne','No live events':'Brak wydarzeń na żywo','Refreshing the live provider feed…':'Odświeżanie kanału dostawcy danych na żywo…','No active event is currently reported by the provider.':'Dostawca nie zgłasza obecnie aktywnego wydarzenia.','Upcoming':'Nadchodzące','No provider events':'Brak wydarzeń od dostawcy','History & calibration':'Historia i kalibracja','History views':'Widoki historii','Compare analysis':'Porównaj analizę','Data quality score':'Wynik jakości danych','Freshness (min)':'Świeżość (min.)','No mission history':'Brak historii misji','Live event':'Wydarzenie na żywo','Scheduled event':'Zaplanowane wydarzenie'
};
const EN_DE_PAGES: Record<string,string> = Object.fromEntries(Object.entries(EN_PL_PAGES).map(([en,pl]) => [en, pl]));

function mapFor(lang: Lang): Record<string,string> {
  if (lang === 'en') return Object.fromEntries(Object.entries({...EN_PL,...EN_PL_EXTRA,...EN_PL_PAGES,...DE_EN,...DE_EN_EXTRA}));
  if (lang === 'de') return {...PL_DE,...EN_DE_AUDIT,...EN_DE_PAGES,...DE_PL_EXTRA,...EN_DE_EXTRA};
  return {...Object.fromEntries(Object.entries(EN_PL).map(([pl,en])=>[en,pl])),...DE_PL,...DE_PL_EXTRA,...EN_PL_EXTRA,...EN_PL_AUDIT,...EN_PL_PAGES};
}

export function translate(source: string, lang: Lang): string {
  const map = mapFor(lang);
  return map[source] ?? source;
}

const originalText = new WeakMap<Text,string>();
let activeLang: Lang = 'pl';
let scheduled = false;
function translateNode(text: Text,map: Record<string,string>) {
  const current=text.nodeValue??''; if(!current.trim()) return;
  if(!originalText.has(text)) originalText.set(text,current);
  const source=originalText.get(text)??current, trimmed=source.trim();
  if(!trimmed || trimmed.length>160) return;
  let replacement=map[trimmed];
  if(!replacement){
    const keys=Object.keys(map).filter(key=>key.length>3&&/\s|[·→/&:+—–-]/.test(key)).sort((a,b)=>b.length-a.length);
    let next=trimmed;
    for(const key of keys){ if(!next.includes(key)) continue; const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); const pattern=new RegExp('(^|[^\\p{L}\\p{N}_])('+escaped+')(?=$|[^\\p{L}\\p{N}_])','gu'); next=next.replace(pattern,(_m,prefix:string)=>prefix+map[key]); }
    if(next!==trimmed) replacement=next;
  }
  if(!replacement){if(current!==source) text.nodeValue=source;return;}
  const start=source.indexOf(trimmed); text.nodeValue=`${source.slice(0,start)}${replacement}${source.slice(start+trimmed.length)}`;
}
export function applyLanguage(lang: Lang){
  activeLang=lang; document.documentElement.lang=lang; document.documentElement.dataset.lang=lang; const map=mapFor(lang);
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT); const nodes:Text[]=[]; let node:Node|null; while((node=walker.nextNode())) nodes.push(node as Text); for(const text of nodes) translateNode(text,map);
  document.querySelectorAll<HTMLElement>('[placeholder],[title],[aria-label]').forEach(el=>{for(const attr of ['placeholder','title','aria-label']){const current=el.getAttribute(attr);if(!current)continue;const sourceKey=`data-bb-i18n-${attr}`,source=el.getAttribute(sourceKey)??current;if(!el.hasAttribute(sourceKey))el.setAttribute(sourceKey,source);const replacement=map[source];el.setAttribute(attr,replacement??source);}});
}
export function detectBrowserLang(): Lang { const saved=localStorage.getItem('bb-lang') as Lang|null; if(saved==='pl'||saved==='en'||saved==='de')return saved; const browser=(navigator.languages?.[0]??navigator.language??'pl').toLowerCase(); if(browser.startsWith('de'))return'de'; if(browser.startsWith('en'))return'en'; return'pl'; }
export function installLanguageObserver(lang: Lang){activeLang=lang;applyLanguage(lang);const observer=new MutationObserver(()=>{if(scheduled)return;scheduled=true;window.requestAnimationFrame(()=>{scheduled=false;applyLanguage(activeLang);});});observer.observe(document.body,{subtree:true,childList:true,characterData:true});return()=>observer.disconnect();}
