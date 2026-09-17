import { Link } from 'react-router-dom';
import { getDataset } from '../services/services';
import { DemoBadge } from '../components/ui';

interface Props {
  builderCount: number;
}

export default function DashboardPage({ builderCount }: Props) {
  const dataset = getDataset();
  const todayEvents = dataset.events.slice(0, 4);
  const liveEvents = dataset.events.filter((e) => e.status === 'LIVE');

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-6 pb-24 md:pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black tracking-tight text-white">Dashboard</h1>
        <DemoBadge />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <section className="rounded-lg border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-300/80">Today's Events</h2>
          <div className="mt-3 space-y-2">
            {todayEvents.map((e) => (
              <div key={e.id} className="text-sm text-white truncate">
                {e.homeTeam} <span className="text-slate-500">vs</span> {e.awayTeam}
              </div>
            ))}
          </div>
          <Link to="/sports" className="mt-3 inline-block text-sm text-violet-400">
            View all →
          </Link>
        </section>

        <section className="rounded-lg border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-300/80">Active Builder</h2>
          <div className="mt-3 text-4xl font-black text-white">{builderCount}</div>
          <div className="text-sm text-slate-400">selections in builder</div>
          <Link to="/builder" className="mt-3 inline-block text-sm text-violet-400">
            Open builder →
          </Link>
        </section>

        <section className="rounded-lg border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-300/80">Live</h2>
          {liveEvents.length === 0 ? (
            <div className="mt-3 text-sm text-slate-400">No live events in demo.</div>
          ) : (
            liveEvents.map((e) => (
              <div key={e.id} className="text-sm text-white">
                {e.homeTeam} vs {e.awayTeam} — LIVE
              </div>
            ))
          )}
        </section>

        <section className="rounded-lg border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-300/80">Market Intelligence</h2>
          <div className="mt-3 text-2xl font-black text-white">{dataset.markets.length}</div>
          <div className="text-sm text-slate-400">demo markets across {new Set(dataset.events.map((e) => e.sport)).size} sports</div>
          <Link to="/analysis" className="mt-3 inline-block text-sm text-violet-400">
            Open analysis →
          </Link>
        </section>
      </div>
    </main>
  );
}
