import { useEffect, useState } from 'react';

/** Live kick-off countdown: "za 2 h 14 min", "00:12:41", or "LIVE". */
export function Countdown({ start, live, className }: { start: string; live?: boolean; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  const target = new Date(start).getTime();
  const diff = target - now;
  useEffect(() => {
    if (live) return;
    const every = diff < 3_600_000 ? 1000 : 30_000;
    const t = window.setInterval(() => setNow(Date.now()), every);
    return () => window.clearInterval(t);
  }, [live, diff]);

  if (live || diff <= 0) {
    return <span className={className}><span className="inline-flex items-center gap-1.5 font-black text-red-300"><span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />LIVE</span></span>;
  }
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  const text = diff < 3_600_000
    ? `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : h >= 24 ? `za ${Math.floor(h / 24)} d ${h % 24} h` : `za ${h} h ${String(m).padStart(2, '0')} min`;
  return <span className={className} aria-label={`Start za ${h} godzin ${m} minut`}><span className="fl-num">{text}</span></span>;
}
