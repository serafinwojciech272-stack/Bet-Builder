import { useNavigate } from 'react-router-dom';
import type { EventWithMarkets } from '../domain/types';

type LiveQuote = { label: string; odds: number; bookmaker: string; market: string };

export function EventCard({
  event,
  marketCount,
  defined,
  liveQuotes = [],
}: {
  event: EventWithMarkets;
  marketCount: number;
  defined: boolean;
  liveQuotes?: LiveQuote[];
}) {
  const navigate = useNavigate();
  const time = new Date(event.startTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <button type="button" onClick={() => navigate(`/sports/${event.id}`)}
      className="group w-full text-left rounded-lg border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4 hover:border-violet-500/50 hover:shadow-[0_0_0_1px_rgba(139,92,246,0.25),0_10px_30px_-10px_rgba(139,92,246,0.35)] transition">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-violet-300/80">{event.league} · {event.competition}</div>
          <div className="mt-1.5 text-[15px] font-bold text-white leading-tight">{event.homeTeam} <span className="text-slate-500">vs</span> {event.awayTeam}</div>
          <div className="mt-1 text-xs text-slate-400">{event.status === 'LIVE' ? 'LIVE' : time} · {marketCount} markets</div>
        </div>
        <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-300">{event.sport}</span>
      </div>

      {liveQuotes.length > 0 ? (
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {liveQuotes.slice(0, 3).map((quote, index) => (
            <div key={`${quote.market}-${quote.label}-${quote.bookmaker}-${index}`} className="rounded-md border border-emerald-400/15 bg-emerald-400/[.05] px-2 py-2">
              <div className="truncate text-[9px] uppercase tracking-wide text-slate-400">{quote.label}</div>
              <div className="mt-0.5 font-mono text-sm font-bold text-emerald-300">{quote.odds.toFixed(2)}</div>
              <div className="truncate text-[8px] text-slate-500">{quote.bookmaker}</div>
            </div>
          ))}
        </div>
      ) : defined ? (
        <div className="mt-3 rounded-md border border-amber-400/15 bg-amber-400/[.04] px-2 py-1.5 text-[9px] uppercase tracking-wide text-amber-300">Markets available · price details on event</div>
      ) : null}
    </button>
  );
}
