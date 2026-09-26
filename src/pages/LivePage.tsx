import { Activity, Radio, ShieldCheck } from 'lucide-react';
import { useEffect } from 'react';
import { useIntelligence } from '../state/IntelligenceProvider';
import { EventCard } from '../components/EventCard';
import { EmptyState, Panel, SectionHeading, Stat } from '../components/ui';

export default function LivePage() {
  const { dataset, phase, error, refresh } = useIntelligence();
  const canonical = dataset?.events ?? [];
  const live = canonical.filter((e) => e.status === 'live');
  const snapshots = dataset?.snapshots ?? [];

  useEffect(() => {
    const timer = window.setInterval(() => { void refresh(undefined, true); }, 10 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const toCardEvent = (e: typeof canonical[number]) => ({
    id: e.id,
    sport: e.sportKey,
    league: e.league.name,
    competition: e.league.name,
    homeTeam: e.homeTeam.name,
    awayTeam: e.awayTeam.name,
    startTime: e.startTime,
    status: e.status === 'live' ? 'LIVE' as const : e.status === 'final' ? 'FINISHED' as const : 'SCHEDULED' as const,
    markets: [],
  });

  const marketCountFor = (eventId: string) =>
    new Set(snapshots.filter((s) => s.eventId === eventId).map((s) => s.market)).size;

  return (
    <div className="space-y-8 rise">
      <section className="relative overflow-hidden rounded-2xl border border-negative/20 bg-gradient-to-br from-negative/[.10] via-surface to-surface-2 p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-negative/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-negative/30 bg-negative/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[.16em] text-negative">
                <Radio size={11} className="live-dot" /> Live monitor
              </span>
            </div>
            <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Live board</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Live provider surface. Events and bookmaker snapshots come from the active provider pipeline, never from the deterministic demo seed.</p>
          </div>
          <div className="hidden items-center gap-2 rounded-xl border border-white/[.07] bg-black/20 px-3 py-2 font-mono text-[9px] uppercase tracking-[.14em] text-faint sm:flex">
            <ShieldCheck size={12} className="text-positive" /> no real-money execution
          </div>
        </div>
      </section>

      {error ? (
        <Panel className="border-negative/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><div className="text-sm font-semibold text-negative">Live provider error</div><div className="mt-1 text-xs text-muted">{error}</div></div>
            <button type="button" onClick={() => void refresh(undefined, true)} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/5">Retry live feed</button>
          </div>
        </Panel>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <Panel className="p-4"><Stat label="Live now" value={live.length} hint={phase === 'loading' ? 'refreshing provider' : 'active events'} tone="negative" /></Panel>
        <Panel className="p-4"><Stat label="Event inventory" value={canonical.length} hint="upcoming + active" /></Panel>
        <Panel className="p-4"><Stat label="Snapshots" value={snapshots.length} hint={dataset?.bookmakers?.length ? `${dataset.bookmakers.length} bookmakers` : 'captured prices'} tone="market" /></Panel>
      </section>

      <section>
        <SectionHeading index="01" title="Live now" subtitle="Only events explicitly marked live by the canonical provider feed appear here." icon={<Activity size={17} className="text-negative" />} />
        {live.length === 0
          ? <EmptyState title="No live events" detail={phase === 'loading' ? 'Refreshing the live provider feed…' : 'No active event is currently reported by the provider.'} />
          : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{live.map((e) => <EventCard key={e.id} event={toCardEvent(e)} marketCount={marketCountFor(e.id)} defined={marketCountFor(e.id) > 0} />)}</div>}
      </section>

      <section>
        <SectionHeading index="02" title="Upcoming" subtitle="Current provider inventory, including bookmaker snapshot coverage where available." />
        {canonical.length === 0
          ? <EmptyState title="No provider events" detail="The live feed returned no usable events for the selected date." />
          : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{canonical.map((e) => <EventCard key={e.id} event={toCardEvent(e)} marketCount={marketCountFor(e.id)} defined={marketCountFor(e.id) > 0} />)}</div>}
      </section>
    </div>
  );
}
