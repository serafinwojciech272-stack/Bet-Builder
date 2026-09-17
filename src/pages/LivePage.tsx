import { getDataset } from '../services/services';
import { EventCard } from '../components/EventCard';
import { DemoBadge } from '../components/ui';

export default function LivePage() {
  const dataset = getDataset();
  const live = dataset.events.filter((e) => e.status === 'LIVE');
  const all = dataset.events;

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-6 pb-24 md:pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black tracking-tight text-white">Live</h1>
        <DemoBadge />
      </div>
      {live.length === 0 ? (
        <div className="mt-5 rounded-lg border border-white/10 p-8 text-center text-slate-400">
          No live events in demo data.
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {live.map((e) => (
            <EventCard key={e.id} event={e as never} marketCount={0} defined={false} />
          ))}
        </div>
      )}
      <h2 className="mt-10 text-[12px] font-bold uppercase tracking-[0.2em] text-slate-400">All upcoming</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {all.map((e) => {
          const markets = dataset.markets.filter((m) => m.eventId === e.id);
          const ewm = {
            ...e,
            markets: markets.map((m) => ({ ...m, selections: dataset.selections.filter((s) => s.marketId === m.id) })),
          };
          return <EventCard key={e.id} event={ewm} marketCount={markets.length} defined={markets.length > 0} />;
        })}
      </div>
    </main>
  );
}
