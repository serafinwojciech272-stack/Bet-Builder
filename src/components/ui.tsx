export function DemoBadge({ label = 'DEMO DATA' }: { label?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-widest text-amber-400"
      title="All values on this page are deterministic demo data, not real predictions."
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
      {label}
    </span>
  );
}

export function RiskBadge({ risk }: { risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' }) {
  const colors: Record<string, string> = {
    LOW: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
    MEDIUM: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
    HIGH: 'text-orange-400 border-orange-500/40 bg-orange-500/10',
    CRITICAL: 'text-red-400 border-red-500/40 bg-red-500/10',
  };
  return (
    <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-bold tracking-wider ${colors[risk]}`}>
      {risk}
    </span>
  );
}

export function MovementBadge({ movement }: { movement: 'UP' | 'DOWN' | 'STABLE' }) {
  const map = {
    UP: { icon: '▲', cls: 'text-emerald-400' },
    DOWN: { icon: '▼', cls: 'text-red-400' },
    STABLE: { icon: '—', cls: 'text-slate-400' },
  } as const;
  const m = map[movement];
  return (
    <span className={`text-xs font-semibold ${m.cls}`}>
      {m.icon} {movement}
    </span>
  );
}
