import { Link } from 'react-router-dom';

const LINKS = [
  { to: '/', label: 'Dashboard' },
  { to: '/sports', label: 'Sports' },
  { to: '/live', label: 'Live' },
  { to: '/builder', label: 'Builder' },
  { to: '/analysis', label: 'Analysis' },
  { to: '/history', label: 'History' },
  { to: '/missions', label: 'Missions' },
];

export function TopNav({ builderCount }: { builderCount: number }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b0d12]/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-4 py-3">
        <Link to="/" className="text-sm font-black tracking-[0.25em] text-white">
          BAD<span className="text-violet-400">BUILDER</span>
        </Link>
        <nav className="hidden md:flex items-center gap-1 ml-6">
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="rounded px-3 py-1.5 text-sm text-slate-300 hover:text-white hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto">
          <Link
            to="/builder"
            className="inline-flex items-center gap-2 rounded-md border border-violet-500/40 bg-violet-500/15 px-3 py-1.5 text-sm font-semibold text-violet-200 hover:bg-violet-500/25"
          >
            Builder
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-500 px-1 text-[11px] font-bold text-white">
              {builderCount}
            </span>
          </Link>
        </div>
      </div>
      {/* Mobile nav */}
      <nav className="md:hidden border-t border-white/5">
        <div className="mx-auto flex max-w-[1400px] items-center overflow-x-auto px-2">
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="whitespace-nowrap px-3 py-2.5 text-[13px] text-slate-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}

export function BottomNav({ builderCount }: { builderCount: number }) {
  const items = [
    { to: '/', label: 'Home' },
    { to: '/sports', label: 'Sports' },
    { to: '/builder', label: 'Builder', badge: true },
    { to: '/analysis', label: 'Analysis' },
    { to: '/missions', label: 'Missions' },
  ];
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 md:hidden border-t border-white/10 bg-[#0b0d12]/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px]">
        {items.map((it) => (
          <Link
            key={it.to}
            to={it.to}
            className="relative flex-1 px-1 py-3 text-center text-[11px] font-medium text-slate-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400"
          >
            {it.badge && builderCount > 0 ? (
              <span className="absolute top-1 right-[calc(50%-22px)] inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-500 px-1 text-[10px] font-bold text-white">
                {builderCount}
              </span>
            ) : null}
            {it.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
