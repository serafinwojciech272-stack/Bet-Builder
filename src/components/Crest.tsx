import { useId } from 'react';
import type { TeamIdentity } from '../lib/teamIdentity';

/** SVG shield generated from a team identity (no external imagery). */
export function Crest({ id, size = 72, title }: { id: TeamIdentity; size?: number; title?: string }) {
  const uid = useId().replace(/:/g, '');
  const shield = 'M50 4 L92 18 V52 C92 76 72 92 50 98 C28 92 8 76 8 52 V18 Z';
  const fontSize = id.initials.length > 2 ? 26 : 32;
  return (
    <svg width={size} height={size * 1.04} viewBox="0 0 100 104" role="img" aria-label={title ?? id.initials} className="drop-shadow-[0_10px_24px_rgba(0,0,0,.55)]">
      <defs>
        <linearGradient id={`g${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={id.primary} />
          <stop offset="1" stopColor={id.secondary} />
        </linearGradient>
        <linearGradient id={`s${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" />
          <stop offset=".45" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`c${uid}`}><path d={shield} /></clipPath>
      </defs>
      <path d={shield} fill={`url(#g${uid})`} />
      <g clipPath={`url(#c${uid})`} opacity=".22">
        {id.pattern === 'stripes' && [20, 40, 60, 80].map((x) => <rect key={x} x={x - 5} y="0" width="10" height="104" fill="#fff" />)}
        {id.pattern === 'sash' && <rect x="-20" y="40" width="160" height="22" fill="#fff" transform="rotate(-35 50 52)" />}
        {id.pattern === 'halves' && <rect x="50" y="0" width="50" height="104" fill="#000" />}
      </g>
      <path d={shield} fill={`url(#s${uid})`} />
      <path d={shield} fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="2.5" />
      <path d="M50 12 L84 23 V52 C84 72 68 85 50 90 C32 85 16 72 16 52 V23 Z" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="1.2" />
      <text x="50" y="62" textAnchor="middle" fontFamily="Anton, Oswald, Impact, sans-serif" fontSize={fontSize} fill="#fff" style={{ letterSpacing: '0.04em' }}>{id.initials}</text>
    </svg>
  );
}
