import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIntelligence } from '../state/IntelligenceProvider';
import { liveEvents } from '../services/liveAdapter';

export default function SportsPage() {
  const navigate = useNavigate();
  const { dataset, phase, error, selectedDate, refresh, lastRefreshedAt } = useIntelligence();
  const [sport, setSport] = useState('');
  const [league, setLeague] = useState('');
  const [search, setSearch] = useState('');
  const events = useMemo(() => (dataset ? liveEvents(dataset) : []), [dataset]);
  const sports = useMemo(() => [...new Set(events.map((e) => e.sport))].sort(), [events]);
  const leagues = useMemo(() => [...new Set(events.map((e) => e.league))].sort(), [events]);
  const filtered = useMemo(() => events.filter((e) => {
    if (sport && e.sport !== sport) return false;
    if (league && e.league !== league) return false;
    if (search) { const q = search.toLowerCase(); if (!`${e.homeTeam} ${e.awayTeam} ${e.league}`.toLowerCase().includes(q)) return false; }
    return true;
  }), [events, sport, league, search]);
  const bookmakerCount = dataset?.bookmakers?.length ?? new Set(dataset?.snapshots.map((s) => s.bookmaker)).size;
  const marketCount = dataset?.snapshots.length ?? 0;

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-6 pb-24 md:pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-300">LIVE MARKET DATA</div><h1 className="mt-1 text-xl font-black tracking-tight text-white">Sports Offer</h1><p className="mt-1 text-xs text-slate-400">Real bookmaker odds for the selected day · Europe/Warsaw</p></div>
        <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1.5 text-[11px] font-bold text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> THE ODDS API · LIVE</div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3"><div className="text-[10px] uppercase tracking-wider text-slate-500">Events</div><div className="mt-1 text-lg font-black text-white">{events.length}</div></div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3"><div className="text-[10px] uppercase tracking-wider text-slate-500">Bookmakers</div><div className="mt-1 text-lg font-black text-white">{bookmakerCount}</div></div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3"><div className="text-[10px] uppercase tracking-wider text-slate-500">Markets</div><div className="mt-1 text-lg font-black text-white">{marketCount}</div></div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3"><div className="text-[10px] uppercase tracking-wider text-slate-500">Sports</div><div className="mt-1 text-lg font-black text-white">{sports.length}</div></div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <label className="text-[11px] uppercase tracking-wider text-slate-500">Day</label>
        <input type="date" aria-label="Offer date" value={selectedDate} onChange={(e) => { if (e.target.value) void refresh(e.target.value, true); }} className="rounded-md border border-white/15 bg-[#12151c] px-3 py-2 text-sm text-white" />
        <button type="button" onClick={() => void refresh(selectedDate, true)} disabled={phase === 'loading'} className="rounded-md border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-sm font-semibold text-violet-200 disabled:opacity-50">{phase === 'loading' ? 'Loading…' : 'Refresh odds'}</button>
        <span className="ml-auto text-xs text-slate-500">{lastRefreshedAt ? `Updated ${new Date(lastRefreshedAt).toLocaleTimeString()}` : 'Not loaded'}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <select aria-label="Filter by sport" value={sport} onChange={(e) => setSport(e.target.value)} className="rounded-md border border-white/15 bg-[#12151c] px-3 py-2 text-sm text-white"><option value="">All Sports</option>{sports.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <select aria-label="Filter by league" value={league} onChange={(e) => setLeague(e.target.value)} className="rounded-md border border-white/15 bg-[#12151c] px-3 py-2 text-sm text-white"><option value="">All Leagues</option>{leagues.map((l) => <option key={l} value={l}>{l}</option>)}</select>
        <input type="search" aria-label="Search events" placeholder="Search teams or leagues…" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1 rounded-md border border-white/15 bg-[#12151c] px-3 py-2 text-sm text-white placeholder:text-slate-500" />
      </div>

      {phase === 'error' ? <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/5 p-6"><div className="font-bold text-red-200">Live offer unavailable</div><div className="mt-1 text-sm text-slate-400">{error}</div><button type="button" onClick={() => void refresh(selectedDate, true)} className="mt-4 rounded-md border border-white/15 px-3 py-2 text-sm text-white">Retry</button></div> : null}
      {phase !== 'error' && phase !== 'loading' && filtered.length === 0 ? <div className="mt-5 rounded-xl border border-white/10 p-10 text-center"><div className="text-white font-semibold">No provider events for {selectedDate}</div><div className="mt-1 text-sm text-slate-500">There are no live bookmaker events returned for this day and sport set.</div></div> : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((event) => {
          const selectionCount = event.markets.reduce((n, m) => n + m.selections.length, 0);
          const eventBookmakers = new Set(dataset?.snapshots.filter((s) => s.eventId === event.id).map((s) => s.bookmaker)).size;
          return <button key={event.id} type="button" onClick={() => navigate(`/sports/${event.id}`)} className="group rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4 text-left transition hover:border-violet-500/50 hover:shadow-[0_0_0_1px_rgba(139,92,246,0.2),0_10px_30px_-10px_rgba(139,92,246,0.3)]"><div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-violet-300/80"><span>{event.sport} · {event.league}</span><span>{new Date(event.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div><div className="mt-3 text-base font-bold text-white">{event.homeTeam} <span className="text-slate-500">vs</span> {event.awayTeam}</div><div className="mt-3 flex gap-2 text-[11px] text-slate-400"><span>{eventBookmakers} bookmakers</span><span>·</span><span>{selectionCount} prices</span></div><div className="mt-3 text-xs font-semibold text-violet-300">Open full market →</div></button>;
        })}
      </div>
    </main>
  );
}
