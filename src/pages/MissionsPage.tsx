import { useMemo, useState } from 'react';
import { ArrowUpRight, Radar, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useIntelligence } from '../state/IntelligenceProvider';
import type { MissionStatus } from '../missions/types';
import { MISSION_STATUS_ORDER } from '../missions/types';
import { MissionCard } from '../components/MissionUI';
import { Chip, EmptyState, ErrorState, LoadingState, Panel, SectionHeading, Stat } from '../components/ui';
import { cx } from '../lib/format';

const ALL_STATUSES: MissionStatus[] = [...MISSION_STATUS_ORDER, 'FAILED', 'CANCELLED'];

export function MissionsPage() {
  const { missions, phase, error, refresh, nowTick } = useIntelligence();
  const [status, setStatus] = useState<MissionStatus | 'all'>('all');

  const counts = useMemo(() => {
    const map = new Map<MissionStatus, number>();
    for (const mission of missions) {
      map.set(mission.status, (map.get(mission.status) ?? 0) + 1);
    }
    return map;
  }, [missions]);

  const filtered = useMemo(() => {
    if (status === 'all') return missions;
    return missions.filter((mission) => mission.status === status);
  }, [missions, status]);

  const ledgerStats = useMemo(() => {
    const entries = missions.map((mission) => mission.decisionLedger).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    const settled = entries.filter((entry) => entry.settlement.status !== 'PENDING');
    const measuredClv = entries.filter((entry) => entry.clv.measured);
    const positiveClv = measuredClv.filter((entry) => (entry.clv.valuePct ?? 0) > 0);
    return {
      total: entries.length,
      pending: entries.filter((entry) => entry.settlement.status === 'PENDING').length,
      settled: settled.length,
      positiveClvRate: measuredClv.length ? positiveClv.length / measuredClv.length : null,
    };
  }, [missions]);

  if (phase === 'loading' || phase === 'idle') {
    return <LoadingState rows={4} />;
  }

  if (phase === 'error') {
    return <ErrorState detail={error ?? undefined} onRetry={() => void refresh()} />;
  }

  return (
    <div className="space-y-8 rise">
      <section className="relative overflow-hidden rounded-2xl border border-mission/20 bg-gradient-to-br from-mission/[.10] via-surface to-surface-2 p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-mission/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <Chip tone="mission"><Radar size={11} /> Core Engine workflow</Chip>
            <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Mission control</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Governed workflow for observation, approval, execution and measurement. Human approval remains the control boundary.
            </p>
          </div>
          <Chip tone="positive"><ShieldCheck size={11} /> observation-only build</Chip>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Panel className="p-4"><Stat label="Total" value={missions.length} /></Panel>
        <Panel className="p-4"><Stat label="Awaiting approval" value={counts.get('AWAITING_APPROVAL') ?? 0} tone="ai" /></Panel>
        <Panel className="p-4"><Stat label="Completed" value={counts.get('COMPLETED') ?? 0} tone="positive" /></Panel>
        <Panel className="p-4"><Stat label="Failed / cancelled" value={(counts.get('FAILED') ?? 0) + (counts.get('CANCELLED') ?? 0)} tone="negative" /></Panel>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Panel className="p-4"><Stat label="Decision Ledger" value={ledgerStats.total} hint="mission-linked packets" /></Panel>
        <Panel className="p-4"><Stat label="Ledger pending" value={ledgerStats.pending} tone="ai" hint="awaiting settlement" /></Panel>
        <Panel className="p-4"><Stat label="Ledger settled" value={ledgerStats.settled} tone="positive" hint="terminal settlement" /></Panel>
        <Panel className="p-4"><Stat label="Positive CLV rate" value={ledgerStats.positiveClvRate === null ? '—' : `${(ledgerStats.positiveClvRate * 100).toFixed(0)}%`} hint="measured CLV samples" /></Panel>
      </section>

      <section>
        <SectionHeading
          index="01"
          title="Mission queue"
          subtitle="Filter the governed workflow by lifecycle state."
          icon={<Radar size={17} className="text-mission" />}
        />
        <div role="tablist" aria-label="Mission status" className="mb-4 flex flex-wrap gap-1">
          {(['all', ...ALL_STATUSES] as Array<MissionStatus | 'all'>).map((item) => {
            const active = status === item;
            const count = item === 'all' ? missions.length : counts.get(item) ?? 0;
            return (
              <button
                key={item}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setStatus(item)}
                className={cx(
                  'rounded-lg px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.1em] transition-colors',
                  active
                    ? 'bg-mission/15 text-mission ring-1 ring-mission/40'
                    : 'bg-surface-2 text-faint ring-1 ring-line hover:text-foreground',
                )}
              >
                {item === 'all' ? 'all' : item.replace(/_/g, ' ')} {count}
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title="No missions in this state"
            detail="Create a governed mission from an event analysis."
            action={<Link to="/" className="text-xs text-ai hover:underline">Open intelligence dashboard →</Link>}
          />
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {filtered.map((mission) => (
              <li key={mission.id}>
                <MissionCard
                  mission={mission}
                  nowTick={nowTick}
                  footer={
                    <Link to={`/missions/${mission.id}`} className="inline-flex items-center gap-1 text-xs text-mission hover:underline">
                      Open mission <ArrowUpRight size={12} />
                    </Link>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
