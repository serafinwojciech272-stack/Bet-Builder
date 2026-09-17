import { useState } from 'react';
import { Ban, CheckCircle2, Lock, PlayCircle, Send, ShieldCheck } from 'lucide-react';
import type { Mission } from '../missions/types';
import { nextStatuses } from '../missions/stateMachine';
import { useIntelligence } from '../state/IntelligenceProvider';
import { Button, Chip, Panel, OriginTag } from './ui';
import { cx, dateTime } from '../lib/format';

/**
 * Human approval gate. Nothing reaches the Core Engine without passing here:
 * every required check must be acknowledged and no blocker may be present.
 */
export function ApprovalGate({ mission }: { mission: Mission }) {
  const {
    toggleCheck,
    requestApproval,
    approveMission,
    rejectMission,
    cancelMission,
    executeMission,
    busyMissionIds,
  } = useIntelligence();
  const [note, setNote] = useState('');
  const busy = busyMissionIds.includes(mission.id);

  const required = mission.approval.checklist.filter((c) => c.required);
  const outstanding = required.filter((c) => !c.acknowledged);
  const allowed = nextStatuses(mission);
  const canApprove =
    mission.status === 'AWAITING_APPROVAL' &&
    outstanding.length === 0 &&
    mission.approval.blockers.length === 0;
  const canExecute = allowed.includes('EXECUTING');

  return (
    <Panel className="overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2 px-5 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Lock size={15} className="text-warn" aria-hidden />
          Approval gate
        </h3>
        <div className="flex items-center gap-2">
          <Chip
            tone={
              mission.approval.state === 'APPROVED'
                ? 'positive'
                : mission.approval.state === 'REJECTED'
                  ? 'negative'
                  : 'warn'
            }
          >
            {mission.approval.state}
          </Chip>
          <Chip tone="positive">
            <ShieldCheck size={10} aria-hidden />
            mandatory
          </Chip>
        </div>
      </header>

      <div className="grid gap-5 px-5 py-4 lg:grid-cols-2">
        <div>
          <p className="mb-3 text-xs text-muted">
            Execution is unreachable until every mandatory check below is acknowledged by a human
            operator. The state machine rejects any attempt to skip this step.
          </p>
          <ul className="space-y-2">
            {mission.approval.checklist.map((check) => {
              const disabled =
                busy ||
                mission.approval.state !== 'PENDING' ||
                mission.status === 'COMPLETED' ||
                mission.status === 'CANCELLED' ||
                mission.status === 'FAILED';
              return (
                <li key={check.id}>
                  <label
                    className={cx(
                      'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                      check.acknowledged
                        ? 'border-positive/35 bg-positive/[0.06]'
                        : 'border-line bg-surface-2 hover:border-ai/35',
                      disabled && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={check.acknowledged}
                      disabled={disabled}
                      onChange={() => void toggleCheck(mission.id, check.id)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[#5fe3a1]"
                      aria-describedby={`${check.id}-detail`}
                    />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2 text-xs font-medium text-foreground">
                        {check.label}
                        {check.required ? (
                          <Chip tone="warn">required</Chip>
                        ) : (
                          <Chip tone="neutral">optional</Chip>
                        )}
                      </span>
                      <span id={`${check.id}-detail`} className="mt-1 block text-[11px] text-muted">
                        {check.detail}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          {mission.approval.blockers.length ? (
            <div role="alert" className="mt-3 rounded-lg border border-negative/40 bg-negative/[0.07] px-3 py-2">
              <p className="text-[11px] font-semibold text-negative">Hard blockers</p>
              <ul className="mt-1 space-y-1">
                {mission.approval.blockers.map((b) => (
                  <li key={b} className="text-[11px] text-muted">
                    · {b}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div>
          <dl className="grid grid-cols-2 gap-3 rounded-lg border border-line bg-surface-2 p-3 text-[11px]">
            <div>
              <dt className="text-faint">Requested by</dt>
              <dd className="font-mono text-foreground">{mission.approval.requestedBy ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-faint">Requested at</dt>
              <dd className="font-mono text-foreground">
                {mission.approval.requestedAt ? dateTime(mission.approval.requestedAt) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-faint">Decided by</dt>
              <dd className="font-mono text-foreground">{mission.approval.decidedBy ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-faint">Decided at</dt>
              <dd className="font-mono text-foreground">
                {mission.approval.decidedAt ? dateTime(mission.approval.decidedAt) : '—'}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-faint">Decision note</dt>
              <dd className="text-foreground/85">{mission.approval.note ?? '—'}</dd>
            </div>
          </dl>

          {(mission.status === 'AWAITING_APPROVAL' || mission.status === 'DRAFT') && (
            <div className="mt-3">
              <label htmlFor={`note-${mission.id}`} className="text-[11px] text-faint">
                Approval note (recorded on the mission)
              </label>
              <textarea
                id={`note-${mission.id}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="e.g. Observation-only mission, thresholds reviewed against liquidity."
                className="mt-1 w-full resize-y rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-foreground placeholder:text-faint focus:border-ai/50"
              />
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {mission.status === 'DRAFT' ? (
              <Button
                icon={<Send size={13} />}
                loading={busy}
                onClick={() => void requestApproval(mission.id)}
              >
                Submit for approval
              </Button>
            ) : null}
            {mission.status === 'AWAITING_APPROVAL' ? (
              <>
                <Button
                  icon={<CheckCircle2 size={13} />}
                  loading={busy}
                  disabled={!canApprove}
                  title={
                    canApprove
                      ? 'Approve this mission'
                      : `Blocked: ${outstanding.length} required check(s) outstanding`
                  }
                  onClick={() => void approveMission(mission.id, note)}
                >
                  Approve
                </Button>
                <Button
                  variant="danger"
                  icon={<Ban size={13} />}
                  loading={busy}
                  onClick={() => void rejectMission(mission.id, note)}
                >
                  Reject
                </Button>
              </>
            ) : null}
            {canExecute ? (
              <Button
                variant="mission"
                icon={<PlayCircle size={13} />}
                loading={busy}
                onClick={() => void executeMission(mission.id)}
              >
                Dispatch to Core Engine
              </Button>
            ) : null}
            {allowed.includes('CANCELLED') && mission.status !== 'AWAITING_APPROVAL' ? (
              <Button
                variant="ghost"
                loading={busy}
                onClick={() => void cancelMission(mission.id, 'Cancelled by operator')}
              >
                Cancel mission
              </Button>
            ) : null}
          </div>

          {!canApprove && mission.status === 'AWAITING_APPROVAL' ? (
            <p className="mt-2 text-[11px] text-warn" role="status">
              {outstanding.length
                ? `${outstanding.length} mandatory check(s) still unacknowledged — approval is disabled.`
                : 'Approval blocked by a hard blocker.'}
            </p>
          ) : null}
          <p className="mt-3 flex items-center gap-2 text-[11px] text-faint">
            <OriginTag origin="deterministic" label="state machine" />
            Allowed next states: {allowed.length ? allowed.join(', ') : 'none (terminal)'}
          </p>
        </div>
      </div>
    </Panel>
  );
}
