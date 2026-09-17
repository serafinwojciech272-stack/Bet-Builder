import { memo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CircleDot, Radar, ShieldCheck } from 'lucide-react';
import type { Mission, MissionStatus } from '../missions/types';
import { MISSION_STATUS_ORDER, MISSION_TYPE_LABELS } from '../missions/types';
import { Chip, Panel } from './ui';
import { cx, relativeTime } from '../lib/format';

const STATUS_TONE: Record<MissionStatus, 'neutral' | 'warn' | 'ai' | 'mission' | 'positive' | 'negative'> = {
  DRAFT: 'neutral',
  AWAITING_APPROVAL: 'warn',
  APPROVED: 'ai',
  EXECUTING: 'mission',
  MEASURING: 'mission',
  COMPLETED: 'positive',
  FAILED: 'negative',
  CANCELLED: 'neutral',
};

export const MissionStatusBadge = memo(function MissionStatusBadge({
  status,
}: {
  status: MissionStatus;
}) {
  return (
    <Chip tone={STATUS_TONE[status]}>
      <CircleDot
        size={10}
        aria-hidden
        className={status === 'EXECUTING' || status === 'MEASURING' ? 'live-dot' : undefined}
      />
      {status.replace('_', ' ')}
    </Chip>
  );
});

export function MissionLifecycle({ mission }: { mission: Mission }) {
  const terminalBad = mission.status === 'FAILED' || mission.status === 'CANCELLED';
  const currentIndex = MISSION_STATUS_ORDER.indexOf(mission.status);
  return (
    <ol className="flex flex-wrap items-center gap-1" aria-label="Mission lifecycle">
      {MISSION_STATUS_ORDER.map((s, i) => {
        const reached = !terminalBad && currentIndex >= i;
        const isCurrent = mission.status === s;
        return (
          <li key={s} className="flex items-center gap-1">
            <span
              aria-current={isCurrent ? 'step' : undefined}
              className={cx(
                'rounded-md px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] transition-colors',
                reached
                  ? isCurrent
                    ? 'bg-ai/20 text-ai ring-1 ring-ai/50'
                    : 'bg-surface-3 text-muted'
                  : 'bg-transparent text-faint ring-1 ring-line-soft',
              )}
            >
              {s.replace('_', ' ')}
            </span>
            {i < MISSION_STATUS_ORDER.length - 1 ? (
              <ArrowRight size={10} className="text-faint" aria-hidden />
            ) : null}
          </li>
        );
      })}
      {terminalBad ? (
        <li className="ml-1">
          <Chip tone={mission.status === 'FAILED' ? 'negative' : 'neutral'}>{mission.status}</Chip>
        </li>
      ) : null}
    </ol>
  );
}

export const MissionCard = memo(function MissionCard({
  mission,
  nowTick,
  footer,
}: {
  mission: Mission;
  nowTick: number;
  footer?: React.ReactNode;
}) {
  const outstanding = mission.approval.checklist.filter((c) => c.required && !c.acknowledged).length;
  return (
    <Panel tone="mission" className="p-4 transition-colors hover:border-mission/60">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <MissionStatusBadge status={mission.status} />
            <Chip tone="mission">
              <Radar size={10} aria-hidden />
              {MISSION_TYPE_LABELS[mission.type]}
            </Chip>
            <span className="font-mono text-[10px] text-faint">{mission.id}</span>
          </div>
          <Link
            to={`/missions/${mission.id}`}
            className="mt-2 block truncate text-sm font-semibold text-foreground hover:text-mission"
          >
            {mission.objective}
          </Link>
          <p className="mt-0.5 truncate text-xs text-muted">
            {mission.target.eventLabel} · {mission.target.marketLabel}
            {mission.target.selectionLabel ? ` · ${mission.target.selectionLabel}` : ''}
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] uppercase tracking-wider text-faint">updated</div>
          <div className="font-mono text-[11px] text-muted">
            {relativeTime(mission.updatedAt, nowTick)}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Chip tone={mission.risk.level === 'HIGH' ? 'negative' : mission.risk.level === 'ELEVATED' ? 'warn' : 'neutral'}>
          risk {mission.risk.level}
        </Chip>
        <Chip tone={mission.risk.correlationLevel === 'ISOLATED' ? 'positive' : 'mission'}>
          corr {mission.risk.correlationLevel}
        </Chip>
        <Chip tone="positive">
          <ShieldCheck size={10} aria-hidden />
          no monetary exposure
        </Chip>
        {mission.status === 'AWAITING_APPROVAL' ? (
          <Chip tone={outstanding ? 'warn' : 'positive'}>
            {outstanding ? `${outstanding} check(s) outstanding` : 'checks complete'}
          </Chip>
        ) : null}
        {mission.measurement ? (
          <Chip tone={mission.measurement.objectiveMet ? 'positive' : 'neutral'}>
            {mission.measurement.verdict} · CLV {mission.measurement.closingLineValuePct.formatted}
          </Chip>
        ) : null}
      </div>

      {footer ? <div className="mt-3 flex flex-wrap gap-2">{footer}</div> : null}
    </Panel>
  );
});
