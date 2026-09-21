import { memo, useMemo } from 'react';
import type { MovementPoint } from '../domain/services/movementService';
import { clockTime } from '../lib/format';

export interface MovementSeries {
  selectionId: string;
  label: string;
  points: MovementPoint[];
  direction: 'shortening' | 'drifting' | 'stable';
}

const LINE_COLORS = ['#e8c57a', '#5ad8ff', '#c79bff', '#5fe3a1', '#ff7d6b'];

/** Raw market data visual — deliberately amber/monospace, never AI-tinted. */
export const OddsMovementChart = memo(function OddsMovementChart({
  series,
  height = 190,
}: {
  series: MovementSeries[];
  height?: number;
}) {
  const model = useMemo(() => {
    const all = series.flatMap((s) => s.points.map((p) => p.price));
    if (!all.length) return null;
    const min = Math.min(...all);
    const max = Math.max(...all);
    const pad = (max - min) * 0.12 || 0.05;
    const lo = min - pad;
    const hi = max + pad;
    const width = 100;
    const paths = series.map((s, i) => {
      const n = s.points.length;
      const d = s.points
        .map((p, idx) => {
          const x = n === 1 ? width : (idx / (n - 1)) * width;
          const y = 100 - ((p.price - lo) / (hi - lo)) * 100;
          return `${idx === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(' ');
      return { d, color: LINE_COLORS[i % LINE_COLORS.length], label: s.label, points: s.points };
    });
    const first = series[0]?.points ?? [];
    return {
      paths,
      lo,
      hi,
      startLabel: first.length ? clockTime(first[0].t) : '',
      endLabel: first.length ? clockTime(first[first.length - 1].t) : '',
    };
  }, [series]);

  if (!model) {
    return (
      <p className="py-6 text-center text-xs text-faint">No movement history captured yet.</p>
    );
  }

  return (
    <figure className="m-0">
      <div className="relative" style={{ height }}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="odds-chart h-full w-full"
          role="img"
          aria-label={`Odds movement chart for ${series.map((s) => s.label).join(', ')}`}
        >
          {[0, 25, 50, 75, 100].map((y) => (
            <line
              key={y}
              x1="0"
              x2="100"
              y1={y}
              y2={y}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="0.3"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {model.paths.map((p) => (
            <path
              key={p.label}
              d={p.d}
              fill="none"
              stroke={p.color}
              strokeWidth="1.6"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        <span className="pointer-events-none absolute left-1 top-0 font-mono text-[10px] text-faint">
          {model.hi.toFixed(2)}
        </span>
        <span className="pointer-events-none absolute bottom-0 left-1 font-mono text-[10px] text-faint">
          {model.lo.toFixed(2)}
        </span>
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-3">
          {model.paths.map((p) => (
            <span key={p.label} className="flex items-center gap-1.5 text-[11px] text-muted">
              <span
                aria-hidden
                className="inline-block h-[2px] w-4 rounded-full"
                style={{ background: p.color }}
              />
              {p.label}
            </span>
          ))}
        </div>
        <span className="font-mono text-[10px] text-faint">
          {model.startLabel} → {model.endLabel}
        </span>
      </figcaption>
    </figure>
  );
});
