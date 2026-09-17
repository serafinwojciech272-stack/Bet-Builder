import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDataset } from '../services/services';
import { EventCard } from '../components/EventCard';
import { DemoBadge } from '../components/ui';
import { SPORTS } from '../domain/types';

export default function SportsPage() {
  const navigate = useNavigate();
  const dataset = getDataset();
  const [sport, setSport] = useState<string>('');
  const [league, setLeague] = useState<string>('');
  const [search, setSearch] = useState('');

  const leagues = useMemo(() => [...new Set(dataset.events.map((e) => e.league))], [dataset]);

  const filtered = useMemo(() => {
    return dataset.events.filter((e) => {
      if (sport && e.sport !== sport) return false;
      if (league && e.league !== league) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${e.homeTeam} ${e.awayTeam} ${e.league}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [dataset, sport, league, search]);

  const marketCountFor = (eventId: string) =>
    dataset.markets.filter((m) => m.eventId === eventId).length;

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-6 pb-24 md:pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black tracking-tight text-white">Sports Explorer</h1>
        <DemoBadge />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <select
          aria-label="Filter by sport"
          value={sport}
          onChange={(e) => setSport(e.target.value)}
          className="rounded-md border border-white/15 bg-[#12151c] px-3 py-2 text-sm text-white"
        >
          <option value="">All Sports</option>
          {SPORTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by league"
          value={league}
          onChange={(e) => setLeague(e.target.value)}
          className="rounded-md border border-white/15 bg-[#12151c] px-3 py-2 text-sm text-white"
        >
          <option value="">All Leagues</option>
          {leagues.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <input
          type="search"
          aria-label="Search events"
          placeholder="Search teams or leagues..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-white/15 bg-[#12151c] px-3 py-2 text-sm text-white placeholder:text-slate-500"
        />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((e) => {
          const markets = dataset.markets.filter((m) => m.eventId === e.id);
          const eventWithMarkets = {
            ...e,
            markets: markets.map((m) => ({
              ...m,
              selections: dataset.selections.filter((s) => s.marketId === m.id),
            })),
          };
          return (
            <EventCard
              key={e.id}
              event={eventWithMarkets}
              marketCount={marketCountFor(e.id)}
              defined={markets.length > 0}
            />
          );
        })}
        {filtered.length === 0 ? (
          <div className="col-span-full rounded-lg border border-white/10 p-10 text-center text-slate-400">
            No events match your filters.
          </div>
        ) : null}
      </div>

      {/* Hidden accessibility link to builder */}
      <button onClick={() => navigate('/builder')} className="hidden">
        Go to builder
      </button>
    </main>
  );
}
