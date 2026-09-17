import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket, Target } from 'lucide-react';
import type { AnalysisResponse, RecommendedAction } from '../ai/contracts';
import { createDecisionPacketFromAnalysis } from '../core/decisionPacket';
import { useIntelligence } from '../state/IntelligenceProvider';
import { Button, Chip, OriginTag, Panel } from './ui';
import { cx } from '../lib/format';

/**
 * Mission builder — converts an AI recommendation into a DRAFT mission.
 * Monitoring / reassessment only; no staking control exists anywhere here.
 */
export function MissionBuilder({ analysis }: { analysis: AnalysisResponse }) {
  const { createMission, missions } = useIntelligence();
  const navigate = useNavigate();
  const eligible = useMemo(
    () => analysis.recommendedActions.filter((a) => a.missionEligible),
    [analysis.recommendedActions],
  );
  const [actionId, setActionId] = useState(eligible[0]?.id ?? '');
  const [selectionId, setSelectionId] = useState(
    analysis.valueSignals[0]?.selectionId ?? analysis.marketObservations[0]?.selectionId ?? '',
  );
  const [threshold, setThreshold] = useState(3);
  const [intervalMin, setIntervalMin] = useState(15);
  const [horizon, setHorizon] = useState(180);
  const [creating, setCreating] = useState(false);

  const action: RecommendedAction | undefined = eligible.find((a) => a.id === actionId);
  const decisionPacket = useMemo(
    () => createDecisionPacketFromAnalysis(analysis, new Date(), selectionId ? [selectionId] : undefined),
    [analysis, selectionId],
  );
  const existing = missions.filter((m) => m.sourceAnalysisId === analysis.analysisId);

  if (!eligible.length) {
    return (
      <Panel className="p-5">
        <p className="text-sm text-muted">
          The intelligence layer did not surface any mission-eligible action for this analysis.
        </p>
      </Panel>
    );
  }

  const submit = async () => {
    if (!action) return;
    setCreating(true);
    const mission = await createMission(analysis, action, {
      movementThresholdPct: threshold,
      intervalMinutes: intervalMin,
      horizonMinutes: horizon,
      selectionId: selectionId || null,
      decisionPacket,
    });
    setCreating(false);
    if (mission) navigate(`/missions/${mission.id}`);
  };

  return (
    <Panel tone="mission" className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Rocket size={15} className="text-mission" aria-hidden />
          Mission builder
        </h3>
        <div className="flex items-center gap-2">
          <OriginTag origin="ai-inference" label="AI proposal" />
          <Chip tone="positive">observation only</Chip>
        </div>
      </div>

      <fieldset className="mb-4">
        <legend className="mb-2 text-[11px] uppercase tracking-[0.12em] text-faint">
          Proposed mission
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {eligible.map((a) => (
            <label
              key={a.id}
              className={cx(
                'flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                a.id === actionId
                  ? 'border-mission/55 bg-mission/[0.08]'
                  : 'border-line bg-surface-2 hover:border-mission/35',
              )}
            >
              <input
                type="radio"
                name="mission-action"
                value={a.id}
                checked={a.id === actionId}
                onChange={() => setActionId(a.id)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#c79bff]"
              />
              <span className="min-w-0">
                <span className="block text-xs font-medium text-foreground">{a.title}</span>
                <span className="mt-1 block text-[11px] leading-relaxed text-muted">{a.detail}</span>
                <span className="mt-1 inline-flex gap-2">
                  <Chip tone={a.priority === 'high' ? 'negative' : a.priority === 'medium' ? 'warn' : 'neutral'}>
                    {a.priority} priority
                  </Chip>
                  <Chip tone="mission">{a.kind.replace(/_/g, ' ').toLowerCase()}</Chip>
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-[11px] text-faint">
          Target selection
          <select
            value={selectionId}
            onChange={(e) => setSelectionId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-xs text-foreground"
          >
            {analysis.marketObservations.map((o) => (
              <option key={o.selectionId} value={o.selectionId}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-faint">
          Movement trigger: {threshold.toFixed(1)}%
          <input
            type="range"
            min={1}
            max={10}
            step={0.5}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="mt-2 w-full accent-[#c79bff]"
            aria-label="Movement trigger threshold in percent"
          />
        </label>
        <label className="text-[11px] text-faint">
          Observation interval: {intervalMin}m
          <input
            type="range"
            min={5}
            max={60}
            step={5}
            value={intervalMin}
            onChange={(e) => setIntervalMin(Number(e.target.value))}
            className="mt-2 w-full accent-[#c79bff]"
            aria-label="Observation interval in minutes"
          />
        </label>
        <label className="text-[11px] text-faint">
          Horizon: {horizon}m
          <input
            type="range"
            min={30}
            max={720}
            step={30}
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
            className="mt-2 w-full accent-[#c79bff]"
            aria-label="Mission horizon in minutes"
          />
        </label>
      </div>

      <div className="mt-4 rounded-lg border border-line bg-surface-2 px-4 py-3">
        <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-faint">
          <Target size={12} aria-hidden />
          Draft preview
        </p>
        <p className="mt-2 text-sm text-foreground">
          {action?.title ?? '—'}
        </p>
        <p className="mt-1 text-xs text-muted">
          Observe{' '}
          <span className="font-mono text-market">
            {analysis.marketObservations.find((o) => o.selectionId === selectionId)?.label ??
              analysis.context.marketLabel}
          </span>{' '}
          every {intervalMin} minutes for {horizon} minutes; re-assess when |Δ price| ≥ {threshold.toFixed(1)}%.
          No stake, order or monetary instruction is created — the mission raises an alert and
          requests a fresh analysis instead.
        </p>
      </div>

      <div className="mt-4 rounded-lg border border-line bg-surface-2 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-[0.12em]">
          <span className="text-faint">Decision Packet</span>
          <span className={decisionPacket.status === 'BLOCKED' ? 'text-negative' : decisionPacket.status === 'CAUTION' ? 'text-warn' : 'text-positive'}>{decisionPacket.status}</span>
        </div>
        <p className="mt-1 text-[11px] text-muted">Immutable evidence: {decisionPacket.selections.length} candidate(s) · {decisionPacket.warnings.length} warning(s) · {decisionPacket.blockers.length} blocker(s).</p>
        {decisionPacket.blockers.length ? <p className="mt-1 text-[11px] text-negative">Mission creation is blocked until the Decision Center blockers are resolved.</p> : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="mission" icon={<Rocket size={13} />} loading={creating} onClick={() => void submit()}>
          Create mission draft
        </Button>
        <span className="text-[11px] text-faint">
          Draft → approval gate → execution. Approval is mandatory.
        </span>
      </div>

      {existing.length ? (
        <p className="mt-3 text-[11px] text-muted">
          {existing.length} mission(s) already exist from this analysis:{' '}
          {existing.map((m) => m.id).join(', ')}
        </p>
      ) : null}
    </Panel>
  );
}
