import { Link } from 'react-router-dom';
import { Flame } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Crest } from './Crest';
import { Countdown } from './Countdown';
import { rivalIdentities } from '../lib/teamIdentity';
import { shares, type MatchRow, type OutcomeCell } from '../lib/matchBoard';

interface Props {
  row: MatchRow;
  badge?: string;
  compact?: boolean;
  isPicked: (selectionId: string) => boolean;
  onPick: (o: OutcomeCell) => void;
  href?: string;
}

/** Split-screen rivalry hero: team colours clash diagonally, crests face off, the market decides the tug-of-war. */
export function VersusHero({ row, badge, compact, isPicked, onPick, href }: Props) {
  const { event } = row;
  const [home, away] = rivalIdentities(event.homeTeam, event.awayTeam);
  const s = shares(row);
  const live = event.status === 'LIVE';
  const style = { '--vs-home': home.primary, '--vs-away': away.primary, '--vs-home-2': home.secondary, '--vs-away-2': away.secondary } as CSSProperties;
  const crest = compact ? 64 : 104;

  return (
    <section className={`vs-stage ${compact ? 'vs-stage--compact' : ''}`} style={style} aria-label={`${event.homeTeam} kontra ${event.awayTeam}`}>
      <div className="vs-side vs-side--home" aria-hidden="true" />
      <div className="vs-side vs-side--away" aria-hidden="true" />
      <div className="vs-seam" aria-hidden="true" />

      <div className="relative z-[1] flex items-center justify-between gap-2 px-4 pt-4 text-[10px] font-black uppercase tracking-[.22em] text-white/80 md:px-6">
        <span className="inline-flex items-center gap-1.5">{badge && <><Flame size={12} className="text-amber-300" />{badge} · </>}{event.league}</span>
        <Countdown start={event.startTime} live={live} className="text-xs tracking-normal text-white" />
      </div>

      <div className="relative z-[1] grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 pb-2 pt-3 md:px-8">
        <div className="vs-team vs-team--home flex flex-col items-center text-center">
          <Crest id={home} size={crest} title={event.homeTeam} />
          <div className={`fl-display mt-2 text-white ${compact ? 'text-lg' : 'text-2xl md:text-3xl'} leading-tight`}>{event.homeTeam}</div>
        </div>
        <div className="vs-mark" aria-hidden="true">
          <svg viewBox="0 0 60 80" className={compact ? 'h-12' : 'h-20 md:h-24'}>
            <path d="M34 2 L10 44 H28 L22 78 L50 30 H32 Z" fill="url(#vsBolt)" />
            <defs><linearGradient id="vsBolt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff6d6" /><stop offset="1" stopColor="#f0cb7a" /></linearGradient></defs>
          </svg>
          <span className="fl-display vs-word">VS</span>
        </div>
        <div className="vs-team vs-team--away flex flex-col items-center text-center">
          <Crest id={away} size={crest} title={event.awayTeam} />
          <div className={`fl-display mt-2 text-white ${compact ? 'text-lg' : 'text-2xl md:text-3xl'} leading-tight`}>{event.awayTeam}</div>
        </div>
      </div>

      {/* tug of war: market consensus */}
      <div className="relative z-[1] px-4 md:px-8">
        <div className="vs-tug" role="img" aria-label={`Szansa wg rynku: ${event.homeTeam} ${(s['1'] * 100).toFixed(0)}%, remis ${(s.X * 100).toFixed(0)}%, ${event.awayTeam} ${(s['2'] * 100).toFixed(0)}%`}>
          <i className="vs-tug__home" style={{ width: `${s['1'] * 100}%` }} />
          <i className="vs-tug__draw" style={{ width: `${s.X * 100}%` }} />
          <i className="vs-tug__away" style={{ width: `${s['2'] * 100}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[11px] font-bold text-white/80">
          <span>{(s['1'] * 100).toFixed(0)}%</span>
          {s.X > 0.01 && <span className="text-white/50">remis {(s.X * 100).toFixed(0)}%</span>}
          <span>{(s['2'] * 100).toFixed(0)}%</span>
        </div>
      </div>

      <div className="relative z-[1] grid grid-cols-3 gap-2 px-4 pb-4 pt-3 md:px-8 md:pb-6" role="group" aria-label="Postaw typ">
        {(['1', 'X', '2'] as const).map((k) => {
          const o = row.outcomes.find((x) => x.key === k);
          if (!o) return <span key={k} />;
          const on = isPicked(o.selectionId);
          return (
            <button key={k} type="button" aria-pressed={on} onClick={() => onPick(o)} className={`fl-odd vs-odd ${on ? 'fl-odd--on' : ''}`}
              aria-label={`${o.label}, kurs ${o.odds.toFixed(2)} w ${o.bookmaker}${on ? ', na kuponie' : ''}`}>
              <span className="text-[10px] font-bold text-white/70">{k === '1' ? event.homeTeam : k === '2' ? event.awayTeam : 'Remis'}</span>
              <span className="fl-num text-lg font-black">{o.odds.toFixed(2)}</span>
              <span className="text-[9px] text-white/50">{o.bookmaker}</span>
              {o.ev > 0.005 && <span className="fl-odd__dot" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      {href && <Link to={href} className="vs-cta" aria-label={`Arena meczu ${event.homeTeam} – ${event.awayTeam}`}>Wejdź na arenę →</Link>}
    </section>
  );
}
