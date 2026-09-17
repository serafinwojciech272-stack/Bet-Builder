import { Activity, Radio, ShieldCheck } from 'lucide-react';
import { getDataset } from '../services/services';
import { EventCard } from '../components/EventCard';
import { DemoBadge, EmptyState, Panel, SectionHeading, Stat } from '../components/ui';

export default function LivePage() {
  const dataset = getDataset();
  const live = dataset.events.filter((e) => e.status === 'LIVE');
  const all = dataset.events;
  const snapshotCount = Object.values(dataset.histories).reduce((total, history) => total + history.length, 0);

  return (
    <div className="space-y-8 rise">
      <section className="relative overflow-hidden rounded-2xl border border-negative/20 bg-gradient-to-br from-negative/[.10] via-surface to-surface-2 p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-negative/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5"><div><div className="flex items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full border border-negative/30 bg-negative/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[.16em] text-negative"><Radio size={11} className="live-dot" /> Live monitor</span><DemoBadge /></div><h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Live board</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Real-time surface for active events, followed by the complete upcoming event inventory.</p></div><div className="hidden items-center gap-2 rounded-xl border border-white/[.07] bg-black/20 px-3 py-2 font-mono text-[9px] uppercase tracking-[.14em] text-faint sm:flex"><ShieldCheck size={12} className="text-positive" /> no real-money execution</div></div>
      </section>
      <section className="grid gap-3 sm:grid-cols-3"><Panel className="p-4"><Stat label="Live now" value={live.length} hint="active events" tone="negative" /></Panel><Panel className="p-4"><Stat label="Event inventory" value={all.length} hint="upcoming + active" /></Panel><Panel className="p-4"><Stat label="Snapshots" value={snapshotCount} hint="captured prices" tone="market" /></Panel></section>
      <section><SectionHeading index="01" title="Live now" subtitle="Active event surface. Provider data is explicitly marked as demo where applicable." icon={<Activity size={17} className="text-negative" />} />{live.length === 0 ? <EmptyState title="No live events" detail="The current demo dataset contains no events in live state." /> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{live.map((e) => <EventCard key={e.id} event={e as never} marketCount={0} defined={false} />)}</div>}</section>
      <section><SectionHeading index="02" title="Upcoming" subtitle="Browse the complete event inventory and available market counts." /> <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{all.map((e) => { const markets = dataset.markets.filter((m) => m.eventId === e.id); const ewm = { ...e, markets: markets.map((m) => ({ ...m, selections: dataset.selections.filter((s) => s.marketId === m.id) })) }; return <EventCard key={e.id} event={ewm} marketCount={markets.length} defined={markets.length > 0} />; })}</div></section>
    </div>
  );
}
