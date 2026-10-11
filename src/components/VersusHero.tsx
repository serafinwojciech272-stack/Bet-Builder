import { Link } from 'react-router-dom';
import { Crown } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Crest } from './Crest';
import { Countdown } from './Countdown';
import { RollNumber } from './RollNumber';
import { rivalIdentities, type TeamIdentity } from '../lib/teamIdentity';
import { shares, type MatchRow, type OutcomeCell } from '../lib/matchBoard';

interface Props {
  row: MatchRow;
  badge?: string;
  compact?: boolean;
  isPicked: (selectionId: string) => boolean;
  onPick: (o: OutcomeCell) => void;
  href?: string;
}

/** Side palettes are the product language: home = lime→gold, away = violet→magenta. */
function sideCrest(id: TeamIdentity, side: 'home' | 'away'): TeamIdentity {
  return side === 'home'
    ? { ...id, primary: '#b6f23a', secondary: '#3c560b' }
    : { ...id, primary: '#a06cf7', secondary: '#4e1870' };
}

const MOTES = [
  { dx: '-46px', dy: '-38px', l: '38%', t: '40%', d: '0s' },
  { dx: '52px', dy: '-30px', l: '58%', t: '46%', d: '1.2s' },
  { dx: '-30px', dy: '44px', l: '44%', t: '58%', d: '2.4s' },
  { dx: '40px', dy: '40px', l: '54%', t: '56%', d: '3.6s' },
];

export function VersusHero({ row, badge, compact, isPicked, onPick, href }: Props) {
  const { event } = row;
  const [h, a] = rivalIdentities(event.homeTeam, event.awayTeam);
  const home = sideCrest(h, 'home');
  const away = sideCrest(a, 'away');
  const s = shares(row);
  const live = event.status === 'LIVE';
  const crest = compact ? 72 : 116;
  const valueKey = [...row.outcomes].sort((x, y) => y.ev - x.ev)[0]?.key;

  return (
    <section className={`ar-hero ${compact ? 'ar-hero--compact' : ''}`} aria-label={`${event.homeTeam} kontra ${event.awayTeam}`}>
      <div className="ar-hero__bleed" aria-hidden="true" />
      <div className="ar-hero__grain" aria-hidden="true" />

      <div className="ar-meta">
        <span className="ar-chip">{badge ? `${badge} · ` : ''}{event.league}</span>
        <span className="ar-count">
          {!live && <span className="ar-count__dot" aria-hidden="true" />}
          <Countdown start={event.startTime} live={live} />
        </span>
      </div>

      <div className="ar-faceoff">
        <div className="ar-team ar-team--home">
          <div className="ar-team__crest"><Crest id={home} size={crest} title={event.homeTeam} /></div>
          <div>
            <div className="ar-team__name">{event.homeTeam}</div>
            {!compact && <div className="ar-team__side mt-2">Gospodarz</div>}
          </div>
        </div>
        <div className="ar-vs" aria-hidden="true">
          <span className="ar-vs__streak" /><span className="ar-vs__streak" /><span className="ar-vs__streak" />
          {MOTES.map((m, i) => (
            <span key={i} className="ar-vs__mote" style={{ left: m.l, top: m.t, animationDelay: m.d, '--dx': m.dx, '--dy': m.dy } as CSSProperties} />
          ))}
          <span className="ar-vs__word">VS</span>
        </div>
        <div className="ar-team ar-team--away">
          <div className="ar-team__crest"><Crest id={away} size={crest} title={event.awayTeam} /></div>
          <div>
            <div className="ar-team__name">{event.awayTeam}</div>
            {!compact && <div className="ar-team__side mt-2">Gość</div>}
          </div>
        </div>
      </div>

      <div className="ar-cont">
        <div className="ar-cont__track" role="img" aria-label={`Szansa wg rynku: ${event.homeTeam} ${(s['1'] * 100).toFixed(0)}%, remis ${(s.X * 100).toFixed(0)}%, ${event.awayTeam} ${(s['2'] * 100).toFixed(0)}%`}>
          <i className="ar-cont__seg ar-cont__seg--home" style={{ width: `${s['1'] * 100}%` }} />
          <i className="ar-cont__seg ar-cont__seg--draw" style={{ width: `${s.X * 100}%` }} />
          <i className="ar-cont__seg ar-cont__seg--away" style={{ width: `${s['2'] * 100}%` }} />
        </div>
        <div className="ar-cont__labels">
          <span><b className="ar-num">{(s['1'] * 100).toFixed(0)}%</b>{event.homeTeam}</span>
          {s.X > 0.01 && <span className="hidden sm:inline"><b className="ar-num">{(s.X * 100).toFixed(0)}%</b>remis</span>}
          <span><b className="ar-num">{(s['2'] * 100).toFixed(0)}%</b>{event.awayTeam}</span>
        </div>
      </div>

      <div className="ar-odds" role="group" aria-label="Postaw typ">
        {(['1', 'X', '2'] as const).map((k) => {
          const o = row.outcomes.find((x) => x.key === k);
          if (!o) return <span key={k} />;
          const on = isPicked(o.selectionId);
          const isValue = k === valueKey;
          const side = k === '1' ? 'home' : k === '2' ? 'away' : 'draw';
          return (
            <button key={k} type="button" aria-pressed={on} onClick={() => onPick(o)}
              className={`ar-odd ar-odd--${side} ${isValue ? 'ar-odd--value' : ''}`}
              aria-label={`${o.label}, kurs ${o.odds.toFixed(2)} w ${o.bookmaker}${isValue ? ', najlepsza wartość' : ''}${on ? ', na kuponie' : ''}`}>
              <span className="ar-odd__bar" aria-hidden="true" />
              {isValue && <span className="ar-odd__crown" aria-hidden="true"><Crown size={13} strokeWidth={2.4} /></span>}
              <span className="ar-odd__k">{k === '1' ? '1 · Gospodarz' : k === '2' ? '2 · Gość' : 'X · Remis'}</span>
              <RollNumber value={o.odds.toFixed(2)} className="ar-odd__v ar-num" />
              <span className="ar-odd__b">{o.bookmaker}</span>
            </button>
          );
        })}
      </div>
      {href && <Link to={href} className="ar-hero__enter">Wejdź na arenę →</Link>}
    </section>
  );
}
