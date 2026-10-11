import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, Crown, Search, Sparkles } from 'lucide-react';
import { useIntelligence } from '../state/IntelligenceProvider';
import { useSlip, type SlipPick } from '../state/SlipProvider';
import { liveEvents } from '../services/liveAdapter';
import { matchOfTheDay, shares, toMatchRow, type MatchRow, type OutcomeCell } from '../lib/matchBoard';
import { VersusHero } from '../components/VersusHero';
import { Crest } from '../components/Crest';
import { rivalIdentities } from '../lib/teamIdentity';

type Filter = 'all' | 'live' | 'value' | 'mine';

const SPORT_LABEL: Record<string, string> = {
  soccer: 'Piłka nożna', basketball: 'Koszykówka', tennis: 'Tenis', icehockey: 'Hokej', baseball: 'Baseball',
  americanfootball: 'Futbol am.', volleyball: 'Siatkówka', handball: 'Piłka ręczna', mma: 'MMA',
};

function warsawDate(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function dayLabel(offset: number, iso: string): string {
  if (offset === 0) return 'Dziś';
  if (offset === 1) return 'Jutro';
  return new Date(iso + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric' });
}
const time = (iso: string) => new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

export function TodayPage() {
  const { dataset, selectedDate, refresh, phase, nowTick } = useIntelligence();
  const slip = useSlip();
  const [filter, setFilter] = useState<Filter>('all');
  const [sport, setSport] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [pulse, setPulse] = useState<string | null>(null);

  const rows = useMemo(() => (dataset ? liveEvents(dataset).map(toMatchRow).filter((r): r is MatchRow => Boolean(r)) : []), [dataset]);
  const sports = useMemo(() => [...new Set(rows.map((r) => r.event.sport))], [rows]);
  const picked = useMemo(() => new Set(slip.picks.map((p) => p.eventId)), [slip.picks]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => sport === 'all' || r.event.sport === sport)
      .filter((r) => filter !== 'live' || r.event.status === 'LIVE')
      .filter((r) => filter !== 'value' || r.bestEv > 0.005)
      .filter((r) => filter !== 'mine' || picked.has(r.event.id))
      .filter((r) => !q || `${r.event.homeTeam} ${r.event.awayTeam} ${r.event.league}`.toLowerCase().includes(q))
      .sort((a, b) => a.event.startTime.localeCompare(b.event.startTime));
  }, [rows, sport, filter, query, picked]);

  const leagues = useMemo(() => {
    const map = new Map<string, MatchRow[]>();
    for (const r of visible) map.set(r.event.league, [...(map.get(r.event.league) ?? []), r]);
    return [...map.entries()];
  }, [visible]);

  const hit = useMemo(() => matchOfTheDay(rows, nowTick), [rows, nowTick]);
  const liveCount = rows.filter((r) => r.event.status === 'LIVE').length;
  const valueCount = rows.filter((r) => r.bestEv > 0.005).length;

  const pick = (row: MatchRow, o: OutcomeCell) => {
    const p: SlipPick = {
      eventId: row.event.id, selectionId: o.selectionId, label: o.label, odds: o.odds, bookmaker: o.bookmaker,
      eventLabel: `${row.event.homeTeam} vs ${row.event.awayTeam}`, league: row.event.league, startTime: row.event.startTime,
      probability: o.probability,
    };
    const run = () => { slip.toggle(p); setPulse(o.selectionId); window.setTimeout(() => setPulse(null), 450); };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (doc.startViewTransition && !reduced) doc.startViewTransition(run); else run();
  };

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 pb-32 pt-2 md:px-6">
      <section className="fl-stage rounded-[24px] border border-white/[.07] px-5 pb-6 pt-6 md:px-8">
        <div aria-hidden="true" className="fl-beams"><span className="fl-lamp fl-lamp--l" /><span className="fl-lamp fl-lamp--r" /><span className="fl-beam fl-beam--l" /><span className="fl-beam fl-beam--r" /></div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[.26em] text-amber-200/80">Mecze i najlepsze kursy</div>
            <h1 className="fl-display mt-2 text-5xl text-white md:text-6xl">{selectedDate === warsawDate(0) ? 'DZIŚ' : selectedDate}</h1>
            <p className="mt-2 text-sm text-slate-300">{rows.length} meczów · {liveCount} na żywo · {valueCount} z kursem powyżej rynku</p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Dzień">
            {[0, 1, 2, 3].map((off) => {
              const iso = warsawDate(off);
              const active = iso === selectedDate;
              return (
                <button key={iso} type="button" role="tab" aria-selected={active} onClick={() => void refresh(iso)}
                  className={active ? 'fl-chip min-w-[72px] px-3 text-sm font-black text-white' : 'fl-chip min-w-[72px] px-3 text-sm font-bold text-slate-400'} aria-pressed={active}>
                  {dayLabel(off, iso)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {([['all', 'Wszystkie'], ['live', `Na żywo${liveCount ? ` · ${liveCount}` : ''}`], ['value', `Powyżej rynku${valueCount ? ` · ${valueCount}` : ''}`], ['mine', `Moje typy${slip.picks.length ? ` · ${slip.picks.length}` : ''}`]] as const).map(([f, l]) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className="fl-chip px-3 text-xs font-bold text-slate-200">{l}</button>
          ))}
          {sports.length > 1 && (
            <select aria-label="Dyscyplina" value={sport} onChange={(e) => setSport(e.target.value)} className="min-h-[44px] rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white">
              <option value="all">Wszystkie sporty</option>
              {sports.map((s) => <option key={s} value={s}>{SPORT_LABEL[s] ?? s}</option>)}
            </select>
          )}
          <label className="flex min-h-[44px] flex-1 items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 sm:max-w-[260px]">
            <Search size={14} className="text-slate-500" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Drużyna lub liga" className="w-full bg-transparent text-base text-white outline-none placeholder:text-slate-500 sm:text-sm" aria-label="Szukaj meczu" />
          </label>
        </div>
      </section>

      {hit && filter === 'all' && !query && (
        <div className="mt-5">
          <VersusHero row={hit} badge="Mecz dnia" compact isPicked={slip.has} onPick={(o) => pick(hit, o)} href={`/match/${encodeURIComponent(hit.event.id)}`} />
        </div>
      )}

      {phase === 'loading' && !dataset && <div className="mt-6 text-sm text-slate-400" role="status">Ładowanie meczów…</div>}
      {dataset && !visible.length && (
        <div className="mt-6 rounded-2xl border border-white/[.07] bg-white/[.02] p-6 text-sm text-slate-300">
          {rows.length ? 'Brak meczów dla wybranych filtrów.' : 'Dostawca nie zwrócił meczów z kursami dla tego dnia. Spróbuj jutro lub odśwież.'}
          {filter !== 'all' && <button type="button" onClick={() => setFilter('all')} className="ml-2 font-bold text-amber-200 underline">Pokaż wszystkie</button>}
        </div>
      )}

      <div className="mt-5 space-y-3">
        {leagues.map(([league, list], gi) => {
          const isCollapsed = collapsed[league];
          return (
            <section key={league} className="fl-ticket fl-in overflow-hidden" style={{ ['--i' as string]: Math.min(gi, 8) }}>
              <button type="button" onClick={() => setCollapsed((c) => ({ ...c, [league]: !c[league] }))} aria-expanded={!isCollapsed}
                className="flex min-h-[48px] w-full items-center justify-between px-4 text-left">
                <span className="ar-league">{league}<b>{list.length}</b></span>
                <ChevronDown size={16} className={isCollapsed ? '-rotate-90 text-slate-500 transition-transform' : 'text-slate-500 transition-transform'} />
              </button>
              {!isCollapsed && (
                <ul className="divide-y divide-white/[.05] border-t border-white/[.06]">
                  {list.map((row) => (
                    <li key={row.event.id} className="ar-board-row grid grid-cols-[52px_1fr] items-center gap-3 px-4 py-3 sm:grid-cols-[60px_1fr_auto]">
                      <div className="text-center">
                        {row.event.status === 'LIVE'
                          ? <span className="ar-live">LIVE</span>
                          : <span className="ar-board-time">{time(row.event.startTime)}</span>}
                      </div>
                      <Link to={`/match/${encodeURIComponent(row.event.id)}`} className="group flex min-w-0 items-center gap-3">
                        <MiniCrests home={row.event.homeTeam} away={row.event.awayTeam} />
                        <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-white">{row.event.homeTeam}</div>
                        <div className="truncate text-sm font-bold text-white">{row.event.awayTeam}</div>
                        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500">
                          {row.bestEv > 0.005 && <><Sparkles size={10} className="text-emerald-300" /><span className="text-emerald-300">kurs powyżej rynku</span> · </>}
                          {row.outcomes[0].books} bukm. <ChevronRight size={11} className="opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                        <MarketBar row={row} />
                        </div>
                      </Link>
                      <div className="col-span-2 grid grid-cols-3 gap-2 sm:col-span-1 sm:w-[264px]" role="group" aria-label={`Kursy: ${row.event.homeTeam} – ${row.event.awayTeam}`}>
                        {(['1', 'X', '2'] as const).map((k) => {
                          const o = row.outcomes.find((x) => x.key === k);
                          if (!o) return <span key={k} className="grid min-h-[52px] place-items-center rounded-xl border border-white/[.05] text-xs text-slate-600">—</span>;
                          const on = slip.has(o.selectionId);
                          const isValue = o.ev > 0.005 && o.ev === row.bestEv;
                          return (
                            <button key={k} type="button" aria-pressed={on} onClick={() => pick(row, o)}
                              title={`${o.label} · ${o.bookmaker} · szansa wg rynku ${(o.probability * 100).toFixed(0)}%`}
                              aria-label={`${o.label}, kurs ${o.odds.toFixed(2)} w ${o.bookmaker}${on ? ', na kuponie' : ''}`}
                              data-side={k === '1' ? 'home' : k === '2' ? 'away' : 'draw'}
                              className={`fl-odd ${on ? 'fl-odd--on' : ''} ${isValue ? 'fl-odd--value' : ''} ${pulse === o.selectionId ? 'fl-pop' : ''}`}
                              style={on ? { viewTransitionName: `pick-${o.selectionId.replace(/[^a-zA-Z0-9_-]/g, '')}` } : undefined}>
                              <span className="text-[10px] font-bold text-slate-400">{k}</span>
                              <span className="fl-num text-base font-black">{o.odds.toFixed(2)}</span>
                              {isValue && <Crown size={11} strokeWidth={2.4} className="fl-odd__crown" aria-hidden="true" />}
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}

function MarketBar({ row }: { row: MatchRow }) {
  const s = shares(row);
  return (
    <div className="ar-mini" role="img" aria-label={`Szansa wg rynku: 1 ${(s['1'] * 100).toFixed(0)}%, X ${(s.X * 100).toFixed(0)}%, 2 ${(s['2'] * 100).toFixed(0)}%`}>
      <i style={{ width: `${s['1'] * 100}%` }} />
      {s.X > 0.01 && <i style={{ width: `${s.X * 100}%` }} />}
      <i style={{ width: `${s['2'] * 100}%` }} />
    </div>
  );
}

function MiniCrests({ home, away }: { home: string; away: string }) {
  const [h, a] = rivalIdentities(home, away);
  return (
    <span className="relative hidden h-10 w-12 shrink-0 sm:block" aria-hidden="true">
      <span className="absolute left-0 top-0"><Crest id={h} size={28} /></span>
      <span className="absolute bottom-0 right-0"><Crest id={a} size={28} /></span>
    </span>
  );
}

export default TodayPage;
