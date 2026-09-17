import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Brain,
  ClipboardList,
  Cpu,
  GraduationCap,
  History,
  Radar,
  Ruler,
  Target,
} from 'lucide-react';
import { useIntelligence } from '../state/IntelligenceProvider';
import { MISSION_TYPE_LABELS } from '../missions/types';
import { ApprovalGate } from '../components/ApprovalGate';
import { MissionLifecycle, MissionStatusBadge } from '../components/MissionUI';
import {
  Chip,
  EmptyState,
  ErrorState,
  LoadingState,
  OriginTag,
  Panel,
  SectionHeading,
  Stat,
} from '../components/ui';
import { cx, dateTime, relativeTime } from '../lib/format';

export function MissionDetailPage() {
  const { missionId = '' } = useParams();
  const { missions, analyses, phase, error, refresh, nowTick } = useIntelligence();

  const mission = useMemo(() => missions.find((m) => m.id === missionId) ?? null, [missions, missionId]);
  const source = useMemo(
    () => analyses.find((a) => a.id === mission?.sourceAnalysisId) ?? null,
    [analyses, mission],
  );

  if (phase === 'loading' || phase === 'idle') return <LoadingState rows={4} />;
  if (phase === 'error') return <ErrorState detail={error ?? undefined} onRetry={() => void refresh()} />;
  if (!mission) {
    return (
      <EmptyState
        title="Mission not found"
        detail={`No mission with id ${missionId} exists in the repository.`}
        action={
          <Link to="/missions" className="text-xs text-ai hover:underline">
            ← Back to mission control
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/missions" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ai">
        <ArrowLeft size={13} aria-hidden />
        Back to mission control
      </Link>

      <Panel tone="mission" className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <MissionStatusBadge status={mission.status} />
              <Chip tone="mission">
                <Radar size={10} aria-hidden />
                {MISSION_TYPE_LABELS[mission.type]}
              </Chip>
              <span className="font-mono text-[10px] text-faint">{mission.id}</span>
            </div>
            <h1 className="mt-2 font-display text-xl font-bold tracking-tight text-foreground">
              {mission.objective}
            </h1>
            <p className="mt-1 text-xs text-muted">
              {mission.target.eventLabel} · {mission.target.marketLabel}
              {mission.target.selectionLabel ? ` · ${mission.target.selectionLabel}` : ''} ·{' '}
              {mission.target.leagueName}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <Stat label="Created" value={relativeTime(mission.createdAt, nowTick)} mono={false} />
            <Stat label="Updated" value={relativeTime(mission.updatedAt, nowTick)} mono={false} />
            <Stat label="Risk" value={mission.risk.level} mono={false} />
            <Stat label="Correlation" value={mission.risk.correlationLevel} mono={false} />
          </div>
        </div>
        <div className="mt-4">
          <MissionLifecycle mission={mission} />
        </div>
      </Panel>

      <Panel tone="ai" className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Brain size={15} className="text-ai" aria-hidden />
              Decision Packet
              <OriginTag origin="deterministic" label="immutable evidence" className="ml-1" />
            </h2>
            <p className="mt-1 text-[11px] text-muted">
              Decision Center evidence carried into Core Engine and this mission.
            </p>
          </div>
          {mission.decisionPacket ? (
            <Chip tone={mission.decisionPacket.status === 'READY' ? 'positive' : mission.decisionPacket.status === 'CAUTION' ? 'warn' : 'negative'}>
              {mission.decisionPacket.status}
            </Chip>
          ) : (
            <Chip tone="neutral">legacy mission</Chip>
          )}
        </div>
        {mission.decisionPacket ? (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Packet" value={mission.decisionPacket.id} mono />
              <Stat label="Version" value={mission.decisionPacket.version} />
              <Stat label="Selections" value={mission.decisionPacket.selections.length} />
              <Stat label="Mission eligible" value={mission.decisionPacket.mission.eligible ? 'yes' : 'no'} mono={false} />
            </div>
            {mission.decisionPacket.blockers.length ? (
              <div className="rounded-lg border border-negative/30 bg-negative/[0.06] px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-negative">Blockers</p>
                <ul className="mt-1 space-y-1">{mission.decisionPacket.blockers.map((b) => <li key={b} className="text-[11px] text-muted">· {b}</li>)}</ul>
              </div>
            ) : null}
            {mission.decisionPacket.warnings.length ? (
              <div className="rounded-lg border border-warn/30 bg-warn/[0.06] px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-warn">Warnings preserved</p>
                <ul className="mt-1 space-y-1">{mission.decisionPacket.warnings.map((w) => <li key={w} className="text-[11px] text-muted">· {w}</li>)}</ul>
              </div>
            ) : null}
            <div className="rounded-lg border border-line bg-surface-2 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">Audit trace</p>
              <ol className="mt-1 space-y-1">{mission.decisionPacket.trace.slice(-6).map((t, i) => <li key={`${i}-${t}`} className="font-mono text-[10px] text-muted">{i + 1}. {t}</li>)}</ol>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-faint">This mission predates the Decision Packet contract.</p>
        )}
      </Panel>

      <ApprovalGate mission={mission} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Brain size={15} className="text-ai" aria-hidden />
            Rationale
            <OriginTag origin="ai-inference" className="ml-1" />
          </h2>
          <ul className="space-y-2">
            {mission.rationale.map((r, i) => (
              <li key={i} className="rounded-lg border border-ai/20 bg-ai/[0.05] px-3 py-2 text-[11px] leading-relaxed text-foreground/85">
                {r}
              </li>
            ))}
          </ul>
          {source ? (
            <Link
              to={`/analysis/${mission.target.eventId}`}
              className="mt-3 inline-flex items-center gap-1 text-[11px] text-ai hover:underline"
            >
              Source analysis {source.id} ({relativeTime(source.analysis.generatedAt, nowTick)}) →
            </Link>
          ) : (
            <p className="mt-3 text-[11px] text-faint">Source analysis {mission.sourceAnalysisId} not in cache.</p>
          )}
        </Panel>

        <Panel className="p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <ClipboardList size={15} className="text-mission" aria-hidden />
            Actions
          </h2>
          <ol className="space-y-2">
            {mission.actions.map((a) => (
              <li key={a.id} className="rounded-lg border border-line bg-surface-2 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-mission">
                    {a.kind.replace(/_/g, ' ')}
                  </span>
                  {a.intervalMinutes ? (
                    <span className="font-mono text-[10px] text-faint">every {a.intervalMinutes.formatted}</span>
                  ) : null}
                </div>
                <p className="mt-1 text-[11px] text-muted">{a.description}</p>
                {a.trigger ? (
                  <p className="mt-1 font-mono text-[10px] text-market">
                    {a.trigger.metric} {a.trigger.comparator === 'gte' ? '≥' : '≤'}{' '}
                    {a.trigger.threshold.formatted}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[11px] text-faint">
            Action vocabulary excludes any staking verb by type — the Core Engine client rejects
            anything outside the observation set.
          </p>
        </Panel>

        <Panel className="p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Target size={15} className="text-ai" aria-hidden />
            Expected outcome
          </h2>
          <p className="text-xs leading-relaxed text-foreground/85">{mission.expectedOutcome.statement}</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Stat label="Metric" value={mission.expectedOutcome.measurableMetric} mono={false} />
            <Stat label="Target" value={mission.expectedOutcome.targetValue.formatted} />
            <Stat label="Horizon" value={mission.expectedOutcome.horizonMinutes.formatted} />
            <Stat label="Exposure" value="none" tone="positive" mono={false} />
          </div>
          <ul className="mt-3 space-y-1">
            {mission.expectedOutcome.successCriteria.map((c) => (
              <li key={c} className="flex gap-2 text-[11px] text-muted">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-ai" aria-hidden />
                {c}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel className="p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Cpu size={15} className="text-mission" aria-hidden />
            Execution
          </h2>
          {mission.execution ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Engine ref" value={mission.execution.engineRef} mono />
                <Stat
                  label="Trigger"
                  value={mission.execution.triggerFired ? 'fired' : 'not fired'}
                  tone={mission.execution.triggerFired ? 'negative' : 'positive'}
                  mono={false}
                />
                <Stat label="Started" value={dateTime(mission.execution.startedAt)} mono={false} />
                <Stat
                  label="Completed"
                  value={mission.execution.completedAt ? dateTime(mission.execution.completedAt) : '—'}
                  mono={false}
                />
              </div>
              <ol className="mt-3 space-y-2">
                {mission.execution.steps.map((s) => (
                  <li key={s.id} className="flex items-start gap-2">
                    <span
                      className={cx(
                        'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                        s.status === 'ok' ? 'bg-positive' : s.status === 'warning' ? 'bg-warn' : 'bg-negative',
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-foreground">
                        {s.label}{' '}
                        <span className="font-mono text-[10px] text-faint">{dateTime(s.at)}</span>
                      </p>
                      <p className="text-[11px] text-muted">{s.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
              {mission.execution.failureReason ? (
                <p role="alert" className="mt-3 rounded-lg border border-negative/40 bg-negative/[0.08] px-3 py-2 text-[11px] text-negative">
                  {mission.execution.failureReason}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-[11px] text-faint">
              No execution record. Execution only becomes reachable after approval.
            </p>
          )}
        </Panel>

        <Panel className="p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Ruler size={15} className="text-market" aria-hidden />
            Measurement
            <OriginTag origin="deterministic" label="measurement-service" className="ml-1" />
          </h2>
          {mission.measurement ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Verdict" value={mission.measurement.verdict} mono={false} />
                <Stat
                  label="CLV"
                  tone={mission.measurement.closingLineValuePct.value > 0 ? 'positive' : 'negative'}
                  value={mission.measurement.closingLineValuePct.formatted}
                />
                <Stat label="Calibration Δ" value={mission.measurement.calibrationDeltaPct.formatted} />
                <Stat label="Brier" value={mission.measurement.brierScore?.formatted ?? '—'} />
              </div>
              <ul className="mt-3 space-y-1">
                {mission.measurement.notes.map((n) => (
                  <li key={n} className="text-[11px] text-muted">
                    · {n}
                  </li>
                ))}
              </ul>
              <Chip tone={mission.measurement.objectiveMet ? 'positive' : 'warn'} className="mt-3">
                objective {mission.measurement.objectiveMet ? 'met' : 'not met'}
              </Chip>
            </>
          ) : (
            <p className="text-[11px] text-faint">Measurement is written once the observation window closes.</p>
          )}
        </Panel>

        <Panel className="p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <GraduationCap size={15} className="text-ai" aria-hidden />
            Learning metadata
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Version" value={mission.learning.version} />
            <Stat label="Feedback" value={mission.learning.outcomeFeedback} mono={false} />
            <Stat label="Model at creation" value={mission.learning.modelVersionAtCreation} mono />
            <Stat label="Quality at creation" value={mission.learning.dataQualityGradeAtCreation} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {mission.learning.tags.map((t) => (
              <Chip key={t} tone="neutral">{t}</Chip>
            ))}
          </div>
          {mission.learning.lessons.length ? (
            <ul className="mt-3 space-y-1.5">
              {mission.learning.lessons.map((l) => (
                <li key={l} className="rounded-lg bg-ai/[0.06] px-3 py-2 text-[11px] text-foreground/85 ring-1 ring-ai/20">
                  {l}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[11px] text-faint">No lessons recorded yet.</p>
          )}
          <p className="mt-3 font-mono text-[10px] text-faint">
            replayable inputs digest: {mission.learning.replayableInputsDigest}
          </p>
        </Panel>
      </div>

      <section>
        <SectionHeading
          title="Transition history"
          subtitle="Every state change recorded by the mission state machine."
          icon={<History size={17} className="text-muted" aria-hidden />}
        />
        <Panel className="overflow-x-auto p-5">
          <table className="w-full min-w-[560px] text-left">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.12em] text-faint">
                <th scope="col" className="py-1.5 font-medium">From</th>
                <th scope="col" className="py-1.5 font-medium">To</th>
                <th scope="col" className="py-1.5 font-medium">Actor</th>
                <th scope="col" className="py-1.5 font-medium">Reason</th>
                <th scope="col" className="py-1.5 text-right font-medium">At</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {mission.history.map((h, i) => (
                <tr key={`${h.to}-${i}`} className="border-t border-line-soft">
                  <td className="py-2 font-mono text-faint">{h.from ?? '—'}</td>
                  <td className="py-2 font-mono text-ai">{h.to}</td>
                  <td className="py-2 font-mono text-muted">{h.actor}</td>
                  <td className="py-2 text-muted">{h.reason}</td>
                  <td className="py-2 text-right font-mono text-faint">{dateTime(h.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </section>
    </div>
  );
}
