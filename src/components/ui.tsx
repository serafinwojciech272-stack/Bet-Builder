import { memo, type HTMLAttributes, type ReactNode } from 'react';
import { AlertTriangle, Cpu, Inbox, LineChart, Loader2, RefreshCw, ShieldAlert, Sparkles } from 'lucide-react';
import { cx } from '../lib/format';

export function Panel({
  children,
  className,
  tone = 'default',
  as: Tag = 'section',
  ...rest
}: {
  children: ReactNode;
  className?: string;
  tone?: 'default' | 'ai' | 'market' | 'mission';
  as?: 'section' | 'div' | 'article' | 'aside';
} & HTMLAttributes<HTMLElement>) {
  const toneClass = tone === 'ai' ? 'ai-surface' : tone === 'market' ? 'market-surface' : tone === 'mission' ? 'bg-surface border border-mission/35' : 'bg-surface border border-line';
  return <Tag className={cx('rounded-xl', toneClass, className)} {...rest}>{children}</Tag>;
}

export function SectionHeading({ index, title, subtitle, icon, action }: { index?: string; title: string; subtitle?: string; icon?: ReactNode; action?: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div className="flex items-start gap-3">{index ? <span className="mt-1 font-mono text-[11px] tracking-widest text-faint">{index}</span> : null}<div><h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">{icon}{title}</h2>{subtitle ? <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p> : null}</div></div>{action}</div>;
}

export const OriginTag = memo(function OriginTag({ origin, label, className }: { origin: 'ai-inference' | 'deterministic'; label?: string; className?: string }) {
  const isAi = origin === 'ai-inference';
  return <span className={cx('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-[2px] font-mono text-[10px] font-medium uppercase tracking-[0.14em]', isAi ? 'bg-ai/15 text-ai ring-1 ring-ai/40' : 'bg-market/10 text-market ring-1 ring-market/40', className)} title={isAi ? 'AI inference' : 'Deterministic'}>{isAi ? <Sparkles aria-hidden size={10} /> : <LineChart aria-hidden size={10} />}{label ?? (isAi ? 'AI inference' : 'Measured')}</span>;
});

export function ServiceTag({ serviceId }: { serviceId: string }) { return <span className="font-mono text-[10px] uppercase tracking-wider text-faint" title={`Computed by ${serviceId}`}>{serviceId}</span>; }

export function Chip({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'positive' | 'negative' | 'warn' | 'ai' | 'mission' | 'market'; className?: string }) {
  const tones: Record<string, string> = { neutral: 'bg-surface-3 text-muted ring-1 ring-line', positive: 'bg-positive/12 text-positive ring-1 ring-positive/35', negative: 'bg-negative/12 text-negative ring-1 ring-negative/35', warn: 'bg-warn/12 text-warn ring-1 ring-warn/35', ai: 'bg-ai/12 text-ai ring-1 ring-ai/35', mission: 'bg-mission/12 text-mission ring-1 ring-mission/35', market: 'bg-market/10 text-market ring-1 ring-market/30' };
  return <span className={cx('inline-flex items-center gap-1 rounded-md px-2 py-[3px] text-[11px] font-medium', tones[tone], className)}>{children}</span>;
}

export function Stat({ label, value, hint, tone = 'default', mono = true }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'ai' | 'market' | 'positive' | 'negative'; mono?: boolean }) {
  const valueTone = tone === 'ai' ? 'text-ai' : tone === 'market' ? 'text-market' : tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : 'text-foreground';
  return <div className="min-w-0"><div className="text-[11px] uppercase tracking-[0.12em] text-faint">{label}</div><div className={cx('mt-1 truncate text-xl font-semibold', mono && 'font-mono', valueTone)}>{value}</div>{hint ? <div className="mt-0.5 truncate text-[11px] text-muted">{hint}</div> : null}</div>;
}

export function Meter({ value, tone = 'ai', label, ariaLabel }: { value: number; tone?: 'ai' | 'positive' | 'negative' | 'warn' | 'mission'; label?: string; ariaLabel?: string }) {
  const clamped = Math.max(0, Math.min(1, value));
  const colors: Record<string, string> = { ai: 'bg-ai', positive: 'bg-positive', negative: 'bg-negative', warn: 'bg-warn', mission: 'bg-mission' };
  return <div role="meter" aria-valuenow={Math.round(clamped * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={ariaLabel ?? label ?? 'meter'} className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"><div className={cx('h-full rounded-full transition-[width] duration-500', colors[tone])} style={{ width: `${clamped * 100}%` }} /></div>;
}

export function Skeleton({ className }: { className?: string }) { return <div className={cx('skeleton rounded-md', className)} aria-hidden />; }
export function LoadingState({ label = 'Loading intelligence…', rows = 3 }: { label?: string; rows?: number }) { return <div role="status" aria-live="polite" className="space-y-3"><div className="flex items-center gap-2 text-sm text-muted"><Loader2 className="animate-spin" size={15} aria-hidden />{label}</div>{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className={cx('h-14 w-full', i === rows - 1 && 'w-2/3')} />)}</div>; }
export function EmptyState({ title, detail, action, icon }: { title: string; detail?: string; action?: ReactNode; icon?: ReactNode }) { return <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line px-6 py-10 text-center"><div className="mb-3 text-faint">{icon ?? <Inbox size={22} aria-hidden />}</div><p className="text-sm font-medium text-foreground">{title}</p>{detail ? <p className="mt-1 max-w-md text-xs text-muted">{detail}</p> : null}{action ? <div className="mt-4">{action}</div> : null}</div>; }
export function ErrorState({ title = 'Something failed upstream', detail, onRetry, retryLabel = 'Retry' }: { title?: string; detail?: string; onRetry?: () => void; retryLabel?: string }) { return <div role="alert" className="rounded-lg border border-negative/40 bg-negative/[0.07] px-4 py-4"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-negative" size={16} aria-hidden /><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-foreground">{title}</p>{detail ? <p className="mt-1 break-words text-xs text-muted">{detail}</p> : null}{onRetry ? <Button className="mt-3" onClick={onRetry} icon={<RefreshCw size={13} />}>{retryLabel}</Button> : null}</div></div></div>; }
export function StaleBanner({ minutes, onRefresh }: { minutes: number; onRefresh?: () => void }) { return <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn/40 bg-warn/[0.07] px-4 py-2.5"><p className="flex items-center gap-2 text-xs text-warn"><AlertTriangle size={14} aria-hidden />Stale data — newest capture is {Math.round(minutes)} minutes old. Figures below are indicative only.</p>{onRefresh ? <Button variant="ghost" onClick={onRefresh} icon={<RefreshCw size={13} />}>Re-pull feed</Button> : null}</div>; }
export function PartialDataBanner({ reasons }: { reasons: string[] }) { return <div role="status" className="rounded-lg border border-market/35 bg-market/[0.06] px-4 py-2.5 text-xs text-market"><span className="font-semibold">Partial data.</span> This analysis ran on an incomplete input set ({reasons.join(', ')}). Conclusions are provisional.</div>; }

export function Button({ children, onClick, variant = 'primary', icon, disabled, loading, className, type = 'button', title, ariaLabel }: { children?: ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost' | 'danger' | 'mission' | 'subtle'; icon?: ReactNode; disabled?: boolean; loading?: boolean; className?: string; type?: 'button' | 'submit'; title?: string; ariaLabel?: string }) {
  const variants: Record<string, string> = { primary: 'bg-ai/15 text-ai ring-1 ring-ai/45 hover:bg-ai/25', mission: 'bg-mission/15 text-mission ring-1 ring-mission/45 hover:bg-mission/25', ghost: 'bg-transparent text-muted ring-1 ring-line hover:text-foreground hover:ring-ai/40', subtle: 'bg-surface-3 text-foreground ring-1 ring-line hover:ring-ai/40', danger: 'bg-negative/12 text-negative ring-1 ring-negative/40 hover:bg-negative/20' };
  return <button type={type} onClick={onClick} disabled={disabled || loading} title={title} aria-label={ariaLabel} aria-busy={loading || undefined} className={cx('inline-flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-150', 'disabled:cursor-not-allowed disabled:opacity-45', variants[variant], className)}>{loading ? <Loader2 className="animate-spin" size={13} aria-hidden /> : icon}{children}</button>;
}

export function EngineBadge({ label, detail }: { label: string; detail: string }) { return <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted" title={detail}><Cpu size={11} aria-hidden className="text-ai" />{label}</span>; }

export function DemoBadge({ label = 'DEMO DATA' }: { label?: string }) { return <span className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-[10px] font-bold tracking-[0.12em] text-amber-300">{label}</span>; }

export function RiskBadge({ risk }: { risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' }) {
  const tone = risk === 'LOW' ? 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10' : risk === 'MEDIUM' ? 'text-amber-300 border-amber-400/30 bg-amber-400/10' : risk === 'HIGH' ? 'text-orange-300 border-orange-400/30 bg-orange-400/10' : 'text-red-300 border-red-400/30 bg-red-400/10';
  return <span className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold tracking-[0.1em]', tone)}><ShieldAlert size={11} />{risk}</span>;
}
