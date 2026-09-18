import { useEffect, useRef, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, Database, History, Info, LayoutDashboard, ListFilter, Radar, RefreshCw, Trophy, Search, ShieldCheck, X, XCircle, Zap } from 'lucide-react';
import { useIntelligence } from '../state/IntelligenceProvider';
import { Button, EngineBadge } from './ui';
import { cx, relativeTime } from '../lib/format';

const NAV = [
  { to: '/', label: 'Matches', icon: ListFilter, key: 'e', end: true },
  { to: '/builder', label: 'Coupon', icon: Zap, key: 'b', end: false },
  { to: '/analysis', label: 'Analysis', icon: LayoutDashboard, key: 'a', end: false },
  { to: '/missions', label: 'Missions', icon: Radar, key: 'm', end: false },
  { to: '/history', label: 'History', icon: History, key: 'h', end: false },
];

function Toasts() {
  const { toasts, dismissToast } = useIntelligence();
  if (!toasts.length) return null;
  return <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">{toasts.map((t) => <div key={t.id} className={cx('rise pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3.5 shadow-2xl backdrop-blur-xl', t.tone === 'success' ? 'border-positive/40 bg-positive/[0.1]' : t.tone === 'error' ? 'border-negative/40 bg-negative/[0.1]' : 'border-ai/40 bg-ai/[0.08]')}>
    {t.tone === 'success' ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-positive" aria-hidden /> : t.tone === 'error' ? <XCircle size={15} className="mt-0.5 shrink-0 text-negative" aria-hidden /> : <Info size={15} className="mt-0.5 shrink-0 text-ai" aria-hidden />}
    <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-foreground">{t.title}</p>{t.detail ? <p className="mt-0.5 break-words text-[11px] leading-relaxed text-muted">{t.detail}</p> : null}</div>
    <button type="button" onClick={() => dismissToast(t.id)} className="text-faint transition-colors hover:text-foreground" aria-label="Dismiss"> <X size={13} aria-hidden /></button>
  </div>)}</div>;
}

function Brand() {
  return <NavLink to="/" className="group flex min-w-0 items-center gap-3" aria-label="Bet Builder home"><span className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl border border-ai/40 bg-ai/[0.12] shadow-[0_0_28px_rgba(139,124,255,.16)]"><span className="absolute inset-0 bg-gradient-to-br from-ai/20 via-transparent to-transparent" /><Zap size={17} className="relative text-ai transition-transform duration-300 group-hover:scale-110" aria-hidden /></span><span className="hidden leading-none sm:block"><span className="block font-display text-[15px] font-bold tracking-[-0.02em] text-foreground">Bet Builder</span><span className="mt-1 block font-mono text-[8px] font-medium uppercase tracking-[0.22em] text-faint">Sports Decision Intelligence</span></span></NavLink>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { engine, refresh, phase, lastRefreshedAt, nowTick, dataset, simulateEngineFailure } = useIntelligence();
  const navigate = useNavigate();
  const location = useLocation();
  const pendingG = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { const target = e.target as HTMLElement | null; if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return; if (e.key.toLowerCase() === 'g') { pendingG.current = true; window.setTimeout(() => { pendingG.current = false; }, 1200); return; } if (pendingG.current) { const match = NAV.find((n) => n.key === e.key.toLowerCase()); if (match) { e.preventDefault(); navigate(match.to); } pendingG.current = false; return; } if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey) void refresh(); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [navigate, refresh]);
  const dataAge = dataset ? (nowTick - new Date(dataset.normalizedAt).getTime()) / 60_000 : 0;
  const feedMode = dataset?.mode ?? '—';
  return <div className="min-h-screen grid-noise">
    <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-ai focus:px-3 focus:py-2 focus:text-xs focus:font-semibold focus:text-ink">Skip to main content</a>
    <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-ink/80 backdrop-blur-2xl"><div className="mx-auto max-w-[1600px] px-4 sm:px-6"><div className="flex h-[68px] items-center gap-4"><Brand /><div className="hidden h-7 w-px bg-white/[0.07] lg:block" /><div className="hidden items-center gap-2 rounded-xl border border-orange-400/20 bg-orange-400/[0.05] px-3 py-1.5 lg:flex"><Trophy size={13} className="text-orange-300" aria-hidden /><span className="font-mono text-[9px] font-bold uppercase tracking-[.16em] text-orange-200/80">Sports Intelligence</span></div><nav aria-label="Primary" className="hidden lg:block"><ul className="flex items-center gap-1">{NAV.map((item) => <li key={item.to}><NavLink to={item.to} end={item.end} title={item.label} className={({ isActive }) => cx('group relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-[12px] font-medium transition-all duration-200', isActive ? 'bg-white/[0.065] text-foreground' : 'text-muted hover:bg-white/[0.035] hover:text-foreground')}><item.icon size={14} className={cx('transition-colors', (location.pathname === item.to || (!item.end && location.pathname.startsWith(item.to))) ? 'text-ai' : 'text-faint group-hover:text-muted')} aria-hidden />{item.label}<kbd className="ml-1 rounded border border-line bg-surface-2 px-1 py-0.5 font-mono text-[8px] text-faint">{item.key}</kbd></NavLink></li>)}</ul></nav><div className="ml-auto flex items-center gap-2"><button type="button" onClick={() => navigate('/events')} className="hidden h-9 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 text-[11px] text-muted transition-all hover:border-ai/30 hover:bg-ai/[0.06] hover:text-foreground md:flex"><Search size={13} aria-hidden /><span>Search events</span><kbd className="ml-2 rounded border border-line px-1.5 py-0.5 font-mono text-[8px] text-faint">/</kbd></button><div className="hidden xl:flex items-center gap-2">{engine ? <EngineBadge label={engine.aiOnline ? 'AI ready · simulated' : 'AI offline'} detail={engine.aiDetail} /> : null}{engine ? <EngineBadge label={`core ${engine.coreVersion}`} detail={`Core Engine client: ${engine.coreEngineId}. Monetary execution: ${engine.monetaryExecution ? 'enabled' : 'disabled'}.`} /> : null}</div><Button variant="subtle" icon={<RefreshCw size={13} />} loading={phase === 'loading'} onClick={() => void refresh()} title="Refresh canonical dataset" ariaLabel="Refresh canonical dataset" /></div></div><div className="flex items-center gap-2 overflow-x-auto border-t border-white/[0.045] py-2 lg:hidden">{NAV.map((item) => <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => cx('flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium', isActive ? 'bg-ai/[0.12] text-ai ring-1 ring-ai/25' : 'text-muted')}><item.icon size={12} aria-hidden />{item.label}</NavLink>)}<span className="ml-auto shrink-0 font-mono text-[9px] text-faint">workspace</span></div></div><div className="border-t border-white/[0.045] bg-black/10"><div className="mx-auto flex h-7 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6"><div className="flex min-w-0 items-center gap-2.5 font-mono text-[9px] uppercase tracking-[0.14em] text-faint"><span className="flex shrink-0 items-center gap-1.5 text-positive"><span className="live-dot h-1.5 w-1.5 rounded-full bg-positive" />system nominal</span><span className="hidden text-line sm:inline">/</span><span className="hidden truncate sm:inline">provider → normalize → intelligence → decision → mission</span><span className="hidden rounded border border-white/[0.06] px-1.5 py-0.5 text-[8px] text-muted sm:inline">{feedMode}</span></div><div className="flex shrink-0 items-center gap-3 font-mono text-[9px] text-faint"><span className="hidden sm:inline"><Database size={9} className="mr-1 inline" />{dataset?.snapshots.length ?? 0} snapshots</span><span>{lastRefreshedAt ? `synced ${relativeTime(lastRefreshedAt, nowTick)}` : 'syncing…'}</span>{dataAge > 5 ? <span className="text-warn">dataset {Math.round(dataAge)}m</span> : null}</div></div></div></header>
    <main id="main" className="mx-auto max-w-[1600px] px-4 py-7 sm:px-6 lg:py-9">{children}</main>
    <footer className="mx-auto max-w-[1600px] px-4 pb-10 pt-2 sm:px-6"><div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-5"><p className="flex items-center gap-2 text-[10px] text-faint"><ShieldCheck size={12} className="text-positive/70" aria-hidden />Deterministic domain data · AI interpretation layer · no real-money execution</p><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-faint">Bet Builder / Sports Intelligence</p></div><button type="button" onClick={simulateEngineFailure} className="sr-only">Inject test fault</button></footer><Toasts />
  </div>;
}
