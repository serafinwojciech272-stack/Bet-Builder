import { CalendarDays, Database, Radio, Search, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIntelligence } from '../state/IntelligenceProvider';
import { SPORT_LABELS } from '../domain/feed/normalization';
import { liveEvents } from '../services/liveAdapter';
import { Chip, EmptyState, ErrorState, Panel, SectionHeading, Stat } from '../components/ui';

export default function SportsPage() {
  const navigate = useNavigate();
  const { dataset, phase, error, selectedDate, refresh, lastRefreshedAt } = useIntelligence();
  const [sport, setSport] = useState('');
  const [league, setLeague] = useState('');
  const [search, setSearch] = useState('');
  const events = useMemo(() => dataset ? liveEvents(dataset) : [], [dataset]);
  const sports = useMemo(() => [...new Set(events.map(e => e.sport))].sort(), [events]);
  const leagues = useMemo(() => [...new Set(events.map(e => e.league))].sort(), [events]);
  const filtered = useMemo(() => events.filter(e => {
    if (sport && e.sport !== sport) return false;
    if (league && e.league !== league) return false;
    if (search && !`${e.homeTeam} ${e.awayTeam} ${e.league}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [events, sport, league, search]);
  const bookmakerCount = dataset?.bookmakers?.length ?? new Set(dataset?.snapshots.map(s => s.bookmaker)).size;

  return <div className="space-y-8 rise">
    <section className="relative overflow-hidden rounded-2xl border border-market/20 bg-gradient-to-br from-market/[.10] via-surface to-surface-2 p-6 sm:p-8">
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-market/10 blur-3xl" />
      <div className="relative flex flex-wrap items-end justify-between gap-5">
        <div><div className="flex flex-wrap items-center gap-2"><Chip tone="market"><Radio size={11}/> Źródło danych</Chip><Chip tone={dataset?.mode === "LIVE" ? "positive" : "warn"}><span className="live-dot h-1.5 w-1.5 rounded-full bg-positive"/> {dataset?.mode === "LIVE" ? "Na żywo" : "Demo"}</Chip></div>
          <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Rynek sportowy</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Wydarzenia, rynki i kursy dla wybranego dnia.</p>
        </div>
        <div className="font-mono text-[9px] uppercase tracking-[.14em] text-faint">Europa / Warszawa</div>
      </div>
    </section>
    <section className="grid gap-3 sm:grid-cols-4">
      <Panel className="p-4"><Stat label="Mecze" value={events.length}/></Panel>
      <Panel className="p-4"><Stat label="Bukmacherzy" value={bookmakerCount} tone="market"/></Panel>
      <Panel className="p-4"><Stat label="Notowania" value={dataset?.snapshots.length ?? 0}/></Panel>
      <Panel className="p-4"><Stat label="Sporty" value={sports.length} tone="ai"/></Panel>
    </section>
    <section>
      <SectionHeading index="01" title="Przeglądarka rynku" subtitle="Filtruj wydarzenia przed otwarciem meczu." icon={<SlidersHorizontal size={17} className="text-ai"/>}/>
      <Panel className="p-4">
        <div className="grid gap-3 md:grid-cols-[auto_auto_1fr_auto]">
          <label className="text-[10px] uppercase tracking-[.12em] text-faint">Data<input type="date" aria-label="Data oferty" value={selectedDate} onChange={e => e.target.value && void refresh(e.target.value, true)} className="mt-1 block w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-foreground"/></label>
          <label className="text-[10px] uppercase tracking-[.12em] text-faint">Sport<select value={sport} onChange={e => setSport(e.target.value)} className="mt-1 block rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-foreground"><option value="">Wszystkie sporty</option>{sports.map(s => <option key={s} value={s}>{SPORT_LABELS[s as keyof typeof SPORT_LABELS] ?? s}</option>)}</select></label>
          <label className="text-[10px] uppercase tracking-[.12em] text-faint">Szukaj<div className="mt-1 flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2"><Search size={13}/><input aria-label="Szukaj wydarzeń" value={search} onChange={e => setSearch(e.target.value)} placeholder="Drużyny lub ligi…" className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-faint"/></div></label>
          <label className="text-[10px] uppercase tracking-[.12em] text-faint">Liga<select value={league} onChange={e => setLeague(e.target.value)} className="mt-1 block max-w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-foreground"><option value="">Wszystkie ligi</option>{leagues.map(l => <option key={l} value={l}>{l}</option>)}</select></label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
          <button type="button" onClick={() => setSport('')} className={`rounded-full px-3 py-1.5 text-[10px] font-bold ${sport === '' ? 'bg-ai/15 text-ai ring-1 ring-ai/30' : 'bg-surface-2 text-faint ring-1 ring-line'}`}>Wszystkie sporty</button>
          {sports.map(s => <button key={s} type="button" onClick={() => { setSport(s); void refresh(selectedDate, true, s); }} className={`rounded-full px-3 py-1.5 text-[10px] font-bold ${sport === s ? 'bg-ai/15 text-ai ring-1 ring-ai/30' : 'bg-surface-2 text-faint ring-1 ring-line'}`}>{SPORT_LABELS[s as keyof typeof SPORT_LABELS] ?? s}</button>)}
          <span className="ml-auto flex items-center gap-1.5 text-[10px] text-faint"><Database size={11}/> {filtered.length} pasujących wydarzeń · {lastRefreshedAt ? `Aktualizacja ${new Date(lastRefreshedAt).toLocaleTimeString('pl-PL')}` : 'Nie załadowano'}</span>
        </div>
      </Panel>
    </section>
    {phase === 'error' ? <ErrorState title="Źródło danych niedostępne" detail={error ?? undefined} onRetry={() => void refresh(selectedDate, true)}/> :
      filtered.length === 0 ? <EmptyState title="Brak pasujących wydarzeń" detail="Zmień filtry albo wybierz inną datę." icon={<CalendarDays size={22}/>}/> :
      <section><SectionHeading index="02" title="Wydarzenia" subtitle="Otwórz wydarzenie, aby zobaczyć dostępne rynki."/>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{filtered.map(event => {
          const selectionCount = event.markets.reduce((n, m) => n + m.selections.length, 0);
          const books = new Set(dataset?.snapshots.filter(s => s.eventId === event.id).map(s => s.bookmaker)).size;
          return <button key={event.id} type="button" onClick={() => navigate(`/sports/${event.id}`)} className="group rounded-2xl border border-line bg-gradient-to-b from-white/[.045] to-white/[.012] p-5 text-left transition-all duration-200 hover:-translate-y-1 hover:border-ai/40 hover:shadow-[0_20px_60px_rgba(0,0,0,.28)]">
            <div className="flex items-center justify-between gap-2 text-[9px] font-mono uppercase tracking-[.14em] text-ai"><span>{event.sport} · {event.league}</span><span className="text-faint">{new Date(event.startTime).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})}</span></div>
            <div className="mt-4 font-display text-base font-semibold text-foreground">{event.homeTeam}<span className="mx-1.5 text-faint">vs</span>{event.awayTeam}</div>
            <div className="mt-4 flex gap-2"><Chip tone="neutral">{books} bukmacherów</Chip><Chip tone="market">{selectionCount} kursów</Chip></div>
            <div className="mt-4 flex items-center justify-between text-xs font-medium text-ai"><span>Otwórz rynek</span><span className="transition-transform group-hover:translate-x-1">→</span></div>
          </button>;
        })}</div>
      </section>}
  </div>;
}