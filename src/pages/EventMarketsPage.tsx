import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDataset } from '../services/services';
import { SelectionRow } from '../components/SelectionRow';
import { DemoBadge } from '../components/ui';

interface Props {
  addSelection: (s: import('../domain/types').Selection) => void;
  removeSelection: (id: string) => void;
  isAdded: (id: string) => boolean;
}

export default function EventMarketsPage({ addSelection, removeSelection, isAdded }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dataset = getDataset();
  const event = dataset.events.find((e) => e.id === id);
  const markets = useMemo(
    () => dataset.markets.filter((m) => m.eventId === id).map((m) => ({ ...m, selections: dataset.selections.filter((s) => s.marketId === m.id) })),
    [id],
  );

  const sections = useMemo(() => {
    const byCat = new Map<string, typeof markets>();
    for (const m of markets) {
      const arr = byCat.get(m.category) ?? [];
      arr.push(m);
      byCat.set(m.category, arr);
    }
    return [...byCat.entries()].map(([category, ms]) => ({ category, ms }));
  }, [markets]);

  if (!event) {
    return (
      <main className="mx-auto max-w-[1400px] px-4 py-10">
        <div className="rounded-lg border border-white/10 p-10 text-center text-slate-300">Event not found.</div>
        <button onClick={() => navigate('/sports')} className="mt-4 text-violet-400">← Back to Sports</button>
      </main>
    );
  }

  const time = new Date(event.startTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-6 pb-24 md:pb-10">
      <button onClick={() => navigate('/sports')} className="text-violet-400 text-sm">← Back to Sports</button>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-violet-300/80">{event.sport} · {event.league}</div>
          <h1 className="mt-1 text-xl font-black text-white leading-tight">{event.homeTeam} <span className="text-slate-500">vs</span> {event.awayTeam}</h1>
          <div className="mt-1 text-xs text-slate-400">{event.status === 'LIVE' ? 'LIVE' : time} · {event.status}</div>
        </div>
        <DemoBadge />
      </div>
      <div className="mt-6 space-y-8">
        {sections.map(({ category, ms }) => (
          <section key={category} aria-label={category}>
            <h2 className="text-[12px] font-bold uppercase tracking-[0.2em] text-slate-400 border-b border-white/10 pb-2">{category}</h2>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {ms.map((m) => (
                <div key={m.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                  <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">{m.name}</div>
                  <div className="space-y-2">
                    {m.selections.map((s) => <SelectionRow key={s.id} selection={s} added={isAdded(s.id)} onAdd={() => addSelection(s)} onRemove={() => removeSelection(s.id)} />)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
        {sections.length === 0 ? <div className="rounded-lg border border-white/10 p-10 text-center text-slate-400">No open markets for this event (demo).</div> : null}
      </div>
    </main>
  );
}
