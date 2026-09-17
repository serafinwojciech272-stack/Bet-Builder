import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Radar, ShieldCheck } from 'lucide-react';
import { useIntelligence } from '../state/IntelligenceProvider';
import type { MissionStatus } from '../missions/types';
import { MISSION_STATUS_ORDER } from '../missions/types';
import { MissionCard } from '../components/MissionUI';
import {
  Chip,
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  SectionHeading,
  Stat,
} from '../components/ui';
import { cx } from '../lib/format';

const ALL_STATUSES: MissionStatus[] = [...MISSION_STATUS_ORDER, 'FAILED', 'CANCELLED'];

export function MissionsPage() {
  const { missions, phase, error, refresh, nowTick } = useIntelligence();
  const [status, setStatus] = useState<MissionStatus | 'all'>('all');

  const counts = useMemo(() => {
    const map = new Map<MissionStatus, number>();
    for (const m of missions) map.set(m.status, (map.get(m.status) ?? 0) + 1);
    return map;
  }, [missions]);

  const filtered = useMemo(
    () => (status === 'all' ? missions : missions.filter((m) => m.status === status)),
    [missions, status],
  );

  if (phase === 'loading' || phase === 'idle') return <LoadingState rows={4} />;
  if (phase === 'error') return <ErrorState detail={error ?? undefined} onRetry={() => void refresh()} />;

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Mission control"
        subtitle="Every mission is observation-only and must clear a human approval gate before the Core Engine client will accept it."
        icon={<Radar size={18} className="text-mission" aria-hidden />}
        action={
          <Chip tone="positive">
            <ShieldCheck size={11} aria-hidden />
            no monetary execution in this build
          </Chip>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Panel className="p-4">
          <Stat label="Total missions" value={missions.length} />
        </Panel>
        <Panel className="p-4">
          <Stat label="Awaiting approval" tone="ai" value={counts.get('AWAITING_APPROVAL') ?? 0} />
        </Panel>
        <Panel className="p-4">
          <Stat label="Completed" tone="positive" value={counts.get('COMPLETED') ?? 0} />
        </Panel>
        <Panel className="p-4">
          <Stat
            label="Failed / cancelled"
            tone="negative"
            value={(counts.get('FAILED') ?? 0) + (counts.get('CANCELLED') ?? 0)}
          />
        </Panel>
      </div>

      <div role="tablist" aria-label="Filter missions by status" className="flex flex-wrap gap-1">
        {(['all', ...ALL_STATUSES] as Array<MissionStatus | 'all'>).map((s) => (
          <button
            key={s}
            role="tab"
            type="button"
            aria-selected={status === s}
            onClick={() => setStatus(s)}
            className={cx(
              'rounded-lg px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors',
              status === s
                ? 'bg-mission/15 text-mission ring-1 ring-mission/40'
                : 'bg-surface-2 text-faint ring-1 ring-line hover:text-foreground',
            )}
          >
            {s === 'all' ? 'all' : s.replace('_', ' ')}
            {s !== 'all' ? ` ${counts.get(s) ?? 0}` : ` ${missions.length}`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No missions in this state"
          detail="Draft one from any event analysis — the mission builder is in section 09."
          action={
            <Link to="/" className="text-xs text-ai hover:underline">
              Open the intelligence dashboard →
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {filtered.map((m) => (
            <li key={m.id}>
              <MissionCard
                mission={m}
                nowTick={nowTick}
                footer={
                  <Link
                    to={`/missions/${m.id}`}
                    className="inline-flex items-center gap-1 text-xs text-mission hover:underline"
                  >
                    Open mission <ArrowUpRight size={12} aria-hidden />
                  </Link>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
