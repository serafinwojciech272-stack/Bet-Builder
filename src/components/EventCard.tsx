import { useNavigate } from 'react-router-dom';
import type { EventWithMarkets } from '../domain/types';
import { DemoBadge } from './ui';

export function EventCard({ event, marketCount, defined }: { event: EventWithMarkets; marketCount: number; defined: boolean }) {
  const navigate = useNavigate();
  const time = new Date(event.startTime).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return (
    <button
      type="button"
      onClick={() => navigate(`/sports/${event.id}`)}
      className="group w-full text-left rounded-lg border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4 hover:border-violet-500/50 hover:shadow-[0_0_0_1px_rgba(139,92,246,0.25),0_10px_30px_-10px_rgba(139,92,246,0.35)] transition"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-violet-300/80">
            {event.league} · {event.competition}
          </div>
          <div className="mt-1.5 text-[15px] font-bold text-white leading-tight">
            {event.homeTeam} <span className="text-slate-500">vs</span> {event.awayTeam}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {event.status === 'LIVE' ? 'LIVE' : time} · {marketCount} markets
          </div>
        </div>
        <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-300">
          {event.sport}
        </span>
      </div>
      {defined ? <div className="mt-3"><DemoBadge /></div> : null}
    </button>
  );
}
