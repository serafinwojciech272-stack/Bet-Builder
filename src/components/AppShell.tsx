import { useEffect, useRef, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Activity,
  CheckCircle2,
  History,
  Info,
  LayoutDashboard,
  ListFilter,
  Radar,
  RefreshCw,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { useIntelligence } from '../state/IntelligenceProvider';
import { Button, EngineBadge } from './ui';
import { cx, relativeTime } from '../lib/format';

const NAV = [
  { to: '/', label: 'Intelligence', icon: LayoutDashboard, key: 'd', end: true },
  { to: '/events', label: 'Events', icon: ListFilter, key: 'e', end: false },
  { to: '/missions', label: 'Missions', icon: Radar, key: 'm', end: false },
  { to: '/history', label: 'History', icon: History, key: 'h', end: false },
];

function Toasts() {
  const { toasts, dismissToast } = useIntelligence();
  if (!toasts.length) return null;
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            'rise pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-xl backdrop-blur',
            t.tone === 'success'
              ? 'border-positive/40 bg-positive/[0.1]'
              : t.tone === 'error'
                ? 'border-negative/40 bg-negative/[0.1]'
                : 'border-ai/40 bg-ai/[0.08]',
          )}
        >
          {t.tone === 'success' ? (
            <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-positive" aria-hidden />
          ) : t.tone === 'error' ? (
            <XCircle size={15} className="mt-0.5 shrink-0 text-negative" aria-hidden />
          ) : (
            <Info size={15} className="mt-0.5 shrink-0 text-ai" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-foreground">{t.title}</p>
            {t.detail ? <p className="mt-0.5 break-words text-[11px] text-muted">{t.detail}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            aria-label={`Dismiss ${t.title}`}
            className="text-faint hover:text-foreground"
          >
            <X size={13} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { engine, refresh, phase, lastRefreshedAt, nowTick, dataset, simulateEngineFailure } =
    useIntelligence();
  const navigate = useNavigate();
  const pendingG = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.key === 'g') {
        pendingG.current = true;
        window.setTimeout(() => {
          pendingG.current = false;
        }, 1200);
        return;
      }
      if (pendingG.current) {
        const match = NAV.find((n) => n.key === e.key);
        if (match) {
          e.preventDefault();
          navigate(match.to);
        }
        pendingG.current = false;
        return;
      }
      if (e.key === 'r' && (e.metaKey || e.ctrlKey) === false) {
        void refresh();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, refresh]);

  const dataAge = dataset ? (nowTick - new Date(dataset.normalizedAt).getTime()) / 60_000 : 0;

  return (
    <div className="min-h-screen grid-noise">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ai focus:px-3 focus:py-2 focus:text-xs focus:font-semibold focus:text-ink"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <NavLink to="/" className="flex items-center gap-2.5" aria-label="BadBuilder home">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-ai/15 ring-1 ring-ai/40">
              <Zap size={16} className="text-ai" aria-hidden />
            </span>
            <span className="leading-tight">
              <span className="block font-display text-sm font-bold tracking-tight text-foreground">
                BadBuilder
              </span>
              <span className="block font-mono text-[9px] uppercase tracking-[0.2em] text-faint">
                Sports Intelligence · Phase 3
              </span>
            </span>
          </NavLink>

          <nav aria-label="Primary" className="order-3 w-full sm:order-none sm:ml-4 sm:w-auto">
            <ul className="flex flex-wrap items-center gap-1">
              {NAV.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cx(
                        'flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                        isActive
                          ? 'bg-ai/12 text-ai ring-1 ring-ai/35'
                          : 'text-muted hover:bg-surface-2 hover:text-foreground',
                      )
                    }
                    title={`Go to ${item.label} (g then ${item.key})`}
                  >
                    <item.icon size={14} aria-hidden />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {engine ? (
              <>
                <EngineBadge
                  label={engine.aiOnline ? 'AI engine · mock' : 'AI engine · offline'}
                  detail={engine.aiDetail}
                />
                <EngineBadge
                  label={`core ${engine.coreVersion}`}
                  detail={`Core Engine client: ${engine.coreEngineId}. Monetary execution: ${engine.monetaryExecution ? 'enabled' : 'disabled'}.`}
                />
              </>
            ) : null}
            <Button
              variant="ghost"
              icon={<Activity size={13} />}
              onClick={simulateEngineFailure}
              title="Inject a transport failure into the next analysis request"
            >
              Inject fault
            </Button>
            <Button
              variant="subtle"
              icon={<RefreshCw size={13} />}
              loading={phase === 'loading'}
              onClick={() => void refresh()}
              title="Re-pull the canonical dataset (shortcut: r)"
            >
              Refresh
            </Button>
          </div>
        </div>
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 pb-2 sm:px-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
            sports data → normalization → canonical domain → snapshots → movement/quality →
            intelligence → core engine → mission → approval → execution → measurement → learning
          </p>
          <p className="hidden shrink-0 font-mono text-[10px] text-faint sm:block">
            {lastRefreshedAt ? `synced ${relativeTime(lastRefreshedAt, nowTick)}` : 'syncing…'}
            {dataAge > 5 ? ` · dataset ${Math.round(dataAge)}m old` : ''}
          </p>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
        {children}
      </main>

      <footer className="mx-auto max-w-[1500px] px-4 pb-10 pt-4 sm:px-6">
        <p className="text-[11px] text-faint">
          BadBuilder Phase 3 — application/intelligence layer. All figures originate from
          deterministic domain services; the AI layer supplies interpretation only. No external AI
          API is connected and no real-money execution exists in this build.
        </p>
      </footer>

      <Toasts />
    </div>
  );
}
