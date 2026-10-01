import type { CanonicalDataset } from '../src/domain/repositories.js';
import type { OddsQuote, OddsSnapshot, SportEvent, SportKey } from '../src/domain/types.js';
import type { BookmakerFeedProvider, BookmakerFeedRequest } from '../src/providers/bookmakerFeed.js';

const BASE_URL = 'https://api.arbiscan.pl/v1';
const PAGE_LIMIT = 500;
const MAX_PAGES = 20;

type AnyRecord = Record<string, unknown>;

function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function num(value: unknown): number | null { const n = Number(value); return Number.isFinite(n) ? n : null; }
function slug(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'unknown'; }
function sportKey(value: string): SportKey {
  const v=value.toLowerCase();
  if (v.includes('basket')) return 'basketball';
  if (v.includes('tennis')) return 'tennis';
  if (v.includes('hockey')) return 'icehockey';
  if (v.includes('baseball')) return 'baseball';
  if (v.includes('volley')) return 'volleyball';
  if (v.includes('handball')) return 'handball';
  if (v.includes('rugby')) return 'rugby';
  if (v.includes('cricket')) return 'cricket';
  return 'soccer';
}
function dateInWarsaw(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}
function marketKey(value: string): 'match-winner'|'moneyline'|'totals'|'spread'|'both-teams-to-score'|'outrights' {
  const v=value.toLowerCase();
  if (v.includes('total') || v.includes('over') || v.includes('under')) return 'totals';
  if (v.includes('spread') || v.includes('handicap')) return 'spread';
  if (v.includes('btts') || v.includes('both')) return 'both-teams-to-score';
  return 'match-winner';
}
function unwrap(raw: AnyRecord): AnyRecord {
  const data = raw.data;
  return data && typeof data === 'object' && !Array.isArray(data) ? data as AnyRecord : raw;
}
function arrayOf(value: unknown): AnyRecord[] {
  return Array.isArray(value) ? value.filter((v): v is AnyRecord => Boolean(v) && typeof v === 'object') : [];
}

function parsePage(raw: AnyRecord, requestedDate: string, requestedBookmakers: string[], pageIndex: number) {
  const root=unwrap(raw);
  const rawEvents=arrayOf(root.events);
  const events: SportEvent[]=[];
  const snapshots: OddsSnapshot[]=[];
  const found=new Set<string>();
  const issues: Array<{code:string; severity:'info'|'warning'|'error'; message:string}>=[];
  for (const event of rawEvents) {
    const id=text(event.id || event.event_id);
    const home=text(event.home_team || event.home || event.homeTeam);
    const away=text(event.away_team || event.away || event.awayTeam);
    const rawTime=text(event.commence_time || event.start_time || event.startTime || event.date);
    const start=new Date(rawTime);
    if (!id || !home || !away || !Number.isFinite(start.getTime()) || dateInWarsaw(start.toISOString()) !== requestedDate) continue;
    const sport=sportKey(text(event.sport || event.sport_key || event.sportKey));
    const league=text(event.league || event.competition || event.tournament || event.league_name) || 'Unknown';
    const eventId=`arbiscan:${id}`;
    events.push({
      id:eventId, sportKey:sport,
      league:{id:slug(league),name:league,sportKey:sport,country:text(event.country)||'Poland'},
      homeTeam:{id:slug(home),name:home,shortName:home.slice(0,18),rating:.5,form:[],injuriesOut:0},
      awayTeam:{id:slug(away),name:away,shortName:away.slice(0,18),rating:.5,form:[],injuriesOut:0},
      startTime:start.toISOString(),status:'scheduled',venue:text(event.venue),monitored:true,liquidity:.8,
    });
    const books=arrayOf(event.bookmakers);
    for (const book of books) {
      const bookKey=text(book.key || book.id || book.name);
      const bookName=text(book.name || book.title || book.key);
      if (!bookKey && !bookName) continue;
      const matches=requestedBookmakers.some(r => {
        const rv=r.toLowerCase(), bv=(bookKey||bookName).toLowerCase();
        return (rv==='sts' && bv.includes('sts')) || (rv==='superbet' && bv.includes('superbet')) || rv===bv;
      });
      if (!matches) continue;
      const canonicalBook=requestedBookmakers.find(r => {
        const rv=r.toLowerCase(), bv=(bookKey||bookName).toLowerCase();
        return (rv==='sts' && bv.includes('sts')) || (rv==='superbet' && bv.includes('superbet')) || rv===bv;
      }) ?? bookName;
      found.add(canonicalBook);
      for (const market of arrayOf(book.markets)) {
        const mkey=text(market.key || market.type || market.name);
        const quotes: OddsQuote[]=[];
        for (const outcome of arrayOf(market.outcomes)) {
          const label=text(outcome.name || outcome.label || outcome.selection);
          const odds=num(outcome.price ?? outcome.odds ?? outcome.decimal_odds);
          if (!label || odds===null || odds<=1) continue;
          quotes.push({selectionId:`${eventId}:${slug(canonicalBook)}:${slug(mkey)}:${slug(label)}`,label,decimalOdds:Number(odds.toFixed(3))});
        }
        if (!quotes.length) continue;
        const capturedAt=text(market.last_update || market.last_seen || book.last_update || root.last_update) || new Date().toISOString();
        snapshots.push({
          id:`${eventId}:${slug(canonicalBook)}:${slug(mkey)}:${capturedAt}`,
          eventId,market:marketKey(mkey),bookmaker:slug(canonicalBook),capturedAt,
          quotes,feedLatencyMs:Math.max(0,Date.now()-new Date(capturedAt).getTime()),provider:'arbiscan',
        });
      }
    }
  }
  const nextCursor=text(root.next_cursor);
  const hasMore=Boolean(root.has_more) && Boolean(nextCursor);
  if (pageIndex>0 && !rawEvents.length) issues.push({code:'arbiscan-empty-page',severity:'info',message:'ArbiScan returned an empty page.'});
  return {events,snapshots,found,nextCursor,hasMore,issues,lastUpdate:text(root.last_update || root.last_seen)};
}

export async function fetchArbiScanBookmakerDataset(date:string,sport:string,bookmakers:string[]):Promise<CanonicalDataset>{
  const apiKey=process.env.ARBISCAN_API_KEY?.trim();
  if (!apiKey) throw new Error('ARBISCAN_NOT_CONFIGURED');
  const requested=[...new Set(bookmakers.map(v=>v.trim()).filter(Boolean))];
  const urlBase=new URL(`${BASE_URL}/odds`);
  urlBase.searchParams.set('bookmakers',requested.map(v=>v.toLowerCase()==='sts'?'sts':v.toLowerCase()==='superbet'?'superbet':v).join(','));
  urlBase.searchParams.set('limit',String(PAGE_LIMIT));
  urlBase.searchParams.set('max_age_seconds','900');
  if (sport !== 'all') urlBase.searchParams.set('sport',sport==='soccer'?'football':sport);
  const events:SportEvent[]=[]; const snapshots:OddsSnapshot[]=[]; const issues:CanonicalDataset['issues']=[];
  const found=new Set<string>(); let cursor=''; let lastUpdate=''; let pages=0;
  while (pages<MAX_PAGES) {
    const url=new URL(urlBase);
    if (cursor) url.searchParams.set('cursor',cursor);
    const response=await fetch(url,{headers:{Accept:'application/json','X-API-Key':apiKey},signal:AbortSignal.timeout(15000)});
    if (response.status===409 && pages===0) throw new Error('ARBISCAN_CURSOR_CONFLICT');
    if (!response.ok) throw new Error(`ARBISCAN_HTTP_${response.status}`);
    const payload=await response.json() as AnyRecord;
    const page=parsePage(payload,date,requested,pages);
    events.push(...page.events); snapshots.push(...page.snapshots); page.found.forEach(v=>found.add(v)); issues.push(...page.issues); lastUpdate=page.lastUpdate||lastUpdate; pages++;
    if (!page.hasMore || !page.nextCursor) break;
    cursor=page.nextCursor;
  }
  const uniqueEvents=[...new Map(events.map(e=>[e.id,e])).values()];
  const uniqueSnapshots=[...new Map(snapshots.map(s=>[s.id,s])).values()];
  const fetchedAt=new Date().toISOString();
  const age=lastUpdate?Math.max(0,Math.round((Date.now()-new Date(lastUpdate).getTime())/1000)):0;
  return {
    events:uniqueEvents,snapshots:uniqueSnapshots,issues,droppedRecords:0,normalizedAt:fetchedAt,
    provider:'arbiscan',mode:uniqueSnapshots.length?'LIVE':'LIVE_DATA_NO_ODDS',requestedDate:date,
    sportsQueried:[sport],bookmakers:[...found],availableSports:[],providerHealth:{
      provider:'arbiscan',state:uniqueSnapshots.length?(age>900?'STALE':'HEALTHY'):'DEGRADED',
      fetchedAt,ageSeconds:age,staleAfterSeconds:900,catalogCount:0,queriedSports:1,successfulSports:1,
      failedSports:0,eventCount:uniqueEvents.length,snapshotCount:uniqueSnapshots.length,bookmakerCount:found.size,
      warnings:pages>=MAX_PAGES?['MAX_PAGES_REACHED']:[],
    },
  };
}

export const arbiScanBookmakerProvider: BookmakerFeedProvider = {
  id:'arbiscan',
  capabilities:['STS','Superbet'],
  isConfigured:()=>Boolean(process.env.ARBISCAN_API_KEY?.trim()),
  fetch:(request:BookmakerFeedRequest)=>fetchArbiScanBookmakerDataset(request.date,request.sport,request.bookmakers),
};
