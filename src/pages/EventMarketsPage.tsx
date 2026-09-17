import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SelectionRow } from '../components/SelectionRow';
import { useIntelligence } from '../state/IntelligenceProvider';
import { liveEvent } from '../services/liveAdapter';
import type { EventWithMarkets, Selection } from '../domain/types';

interface Props { addSelection: (s: Selection) => void; removeSelection: (id: string) => void; isAdded: (id: string) => boolean; }

export default function EventMarketsPage({ addSelection, removeSelection, isAdded }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { dataset, phase, error } = useIntelligence();
  const event = useMemo<EventWithMarkets | undefined>(() => (dataset && id ? liveEvent(dataset, id) : undefined), [dataset, id]);
  const sections = useMemo<Array<[string, EventWithMarkets['markets']]>>(() => {
    if (!event) return [];
    const byCat = new Map<string, EventWithMarkets['markets']>();
    for (const market of event.markets) {
      const arr = byCat.get(market.category) ?? [];
      arr.push(market);
      byCat.set(market.category, arr);
    }
    return [...byCat.entries()];
  }, [event]);

  if (phase === 'loading') return <main className="mx-auto max-w-[1400px] px-4 py-10 text-slate-300">Loading live markets…</main>;
  if (!event) return <main className="mx-auto max-w-[1400px] px-4 py-10"><div className="rounded-lg border border-white/10 p-10 text-center text-slate-300">{error ?? 'Event not found in the live provider feed.'}</div><button onClick={() => navigate('/sports')} className="mt-4 text-violet-400">← Back to Sports</button></main>;
  const time = new Date(event.startTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-6 pb-24 md:pb-10">
      <button onClick={() => navigate('/sports')} className="text-violet-400 text-sm">← Back to Sports</button>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3"><div><div className="text-[11px] uppercase tracking-wider text-violet-300/80">{event.sport} · {event.league}</div><h1 className="mt-1 text-xl font-black text-white leading-tight">{event.homeTeam} <span className="text-slate-500">vs</span> {event.awayTeam}</h1><div className="mt-1 text-xs text-slate-400">{event.status === 'LIVE' ? 'LIVE' : time} · LIVE PROVIDER</div></div><div className="rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1.5 text-[11px] font-bold text-emerald-300">THE ODDS API · LIVE</div></div>
      <div className="mt-6 space-y-8">{sections.map(([category, markets]) => <section key={category}><h2 className="text-[12px] font-bold uppercase tracking-[0.2em] text-slate-400 border-b border-white/10 pb-2">{category}</h2><div className="mt-3 grid gap-3 lg:grid-cols-2">{markets.map((market) => <div key={market.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-3"><div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">{market.name}</div><div className="space-y-2">{market.selections.map((selection: Selection) => <SelectionRow key={selection.id} selection={selection} added={isAdded(selection.id)} onAdd={() => addSelection(selection)} onRemove={() => removeSelection(selection.id)} />)}</div></div>)}</div></section>)}{sections.length === 0 ? <div className="rounded-lg border border-white/10 p-10 text-center text-slate-400">No open markets returned by the provider.</div> : null}</div>
    </main>
  );
}
