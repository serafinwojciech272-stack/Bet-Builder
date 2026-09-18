import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, Brain, History, Radar, Trophy } from 'lucide-react';
import { useIntelligence } from '../state/IntelligenceProvider';
import type { AnalysisRecord } from '../ai/AnalysisRepository';
import { MissionStatusBadge } from '../components/MissionUI';
import {
  Chip,
  EmptyState,
  ErrorState,
  LoadingState,
  Meter,
  OriginTag,
  Panel,
  SectionHeading,
  Stat,
} from '../components/ui';
import { cx, dateTime, relativeTime } from '../lib/format';

type Tab = 'analyses' | 'missions';

function bestEdge(record: AnalysisRecord): number {
  return Math.max(...record.analysis.valueSignals.map((v) => v.edgePct.value), -99);
}

function CompareCell({
  label,
  a,
  b,
  higherIsBetter = true,
  format = (v: number) => v.toFixed(2),
}: {
  label: string;
  a: number;
  b: number;
  higherIsBetter?: boolean;
  format?: (v: number) => string;
}) {
  const delta = b - a;
  const good = higherIsBetter ? delta > 0 : delta < 0;
  return (
    <tr className="border-t border-line-soft">
      <th scope="row" className="py-2 pr-2 text-left text-[11px] font-medium text-muted">
        {label}
      </th>
      <td className="py-2 text-right font-mono text-xs text-foreground">{format(a)}</td>
      <td className="py-2 text-right font-mono text-xs text-foreground">{format(b)}</td>
      <td
        className={cx(
          'py-2 text-right font-mono text-xs',
          Math.abs(delta) < 1e-9 ? 'text-faint' : good ? 'text-positive' : 'text-negative',
        )}
      >
        {delta > 0 ? '+' : ''}
        {format(delta)}
      </td>
    </tr>
  );
}

export function HistoryPage() {
  const { analyses, missions, phase, error, refresh, nowTick } = useIntelligence();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) ?? 'analyses');
  const [selected, setSelected] = useState<string[]>(() => {
    const pre = params.get('analysis');
    return pre ? [pre] : [];
  });

  const sorted = useMemo(
    () =>
      [...analyses].sort((a, b) => b.analysis.generatedAt.localeCompare(a.analysis.generatedAt)),
    [analyses],
  );
  const comparison = useMemo(
    () => selected.map((id) => sorted.find((r) => r.id === id)).filter((r): r is AnalysisRecord => Boolean(r)),
    [selected, sorted],
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id].slice(-2);
    });
  };

  const switchTab = (next: Tab) => {
    setTab(next);
    const p = new URLSearchParams(params);
    p.set('tab', next);
    setParams(p, { replace: true });
  };

  if (phase === 'loading' || phase === 'idle') return <LoadingState rows={5} />;
  if (phase === 'error') return <ErrorState detail={error ?? undefined} onRetry={() => void refresh()} />;

  const resolved = sorted.filter((r) => r.outcome);
  const hitRate = resolved.length
    ? resolved.filter((r) => r.outcome?.outcome === 1).length / resolved.length
    : 0;
  const avgBrier = resolved.length
    ? resolved.reduce((sum, r) => sum + (r.outcome?.measurement.brierScore?.value ?? 0), 0) / resolved.length
    : 0;
  const avgClv = resolved.length
    ? resolved.reduce((sum, r) => sum + (r.outcome?.measurement.closingLineValuePct.value ?? 0), 0) /
      resolved.length
    : 0;

  return (
    <div className="space-y-6">
      <SectionHeading
        title="History & calibration"
        subtitle="Every analysis and mission is retained with its deterministic inputs digest so a future Core Engine can replay it."
        icon={<History size={18} className="text-ai" aria-hidden />}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Panel className="p-4">
          <Stat label="Analyses stored" value={analyses.length} hint={`${resolved.length} resolved`} />
        </Panel>
        <Panel className="p-4">
          <Stat label="Hit rate" tone="positive" value={`${(hitRate * 100).toFixed(0)}%`} hint="resolved selections" />
        </Panel>
        <Panel className="p-4">
          <Stat label="Avg Brier" value={avgBrier.toFixed(3)} hint="lower is better" />
        </Panel>
        <Panel className="p-4">
          <Stat
            label="Avg CLV"
            tone={avgClv > 0 ? 'positive' : 'negative'}
            value={`${avgClv > 0 ? '+' : ''}${avgClv.toFixed(2)}%`}
            hint="closing line value"
          />
        </Panel>
      </div>

      <div role="tablist" aria-label="History views" className="flex gap-1">
        {(
          [
            { id: 'analyses' as Tab, label: 'Analysis history', icon: Brain },
            { id: 'missions' as Tab, label: 'Mission history', icon: Radar },
          ]
        ).map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => switchTab(t.id)}
            className={cx(
              'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              tab === t.id
                ? 'bg-ai/12 text-ai ring-1 ring-ai/40'
                : 'bg-surface-2 text-muted ring-1 ring-line hover:text-foreground',
            )}
          >
            <t.icon size={13} aria-hidden />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'analyses' ? (
        <div className="space-y-4">
          <p className="text-xs text-muted">
            Select up to two analyses to compare. Comparison uses only deterministic figures.
          </p>
          {sorted.length === 0 ? (
            <EmptyState title="No analyses yet" detail="Run an intelligence pass from any event." />
          ) : (
            <Panel className="overflow-x-auto p-5">
              <table className="w-full min-w-[860px] text-left">
                <caption className="sr-only">Analysis history</caption>
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.12em] text-faint">
                    <th scope="col" className="py-1.5 font-medium">Compare</th>
                    <th scope="col" className="py-1.5 font-medium">Analysis</th>
                    <th scope="col" className="py-1.5 font-medium">Event</th>
                    <th scope="col" className="py-1.5 font-medium">Stance</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Confidence</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Quality</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Best edge</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Risk</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Outcome</th>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {sorted.map((r) => (
                    <tr key={r.id} className="border-t border-line-soft align-middle">
                      <td className="py-2 pr-2">
                        <input
                          type="checkbox"
                          checked={selected.includes(r.id)}
                          onChange={() => toggle(r.id)}
                          aria-label={`Compare analysis ${r.id}`}
                          className="h-3.5 w-3.5 accent-[#5ad8ff]"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <span className="block font-mono text-[11px] text-ai">{r.id}</span>
                        <span className="block text-[10px] text-faint">
                          {dateTime(r.analysis.generatedAt)} · {relativeTime(r.analysis.generatedAt, nowTick)}
                        </span>
                      </td>
                      <td className="py-2 pr-2">
                        <Link to={`/analysis/${r.eventId}`} className="text-foreground hover:text-ai">
                          {r.analysis.context.eventLabel}
                        </Link>
                        <span className="block text-[10px] text-faint">{r.analysis.context.marketLabel}</span>
                      </td>
                      <td className="py-2 pr-2">
                        <Chip
                          tone={
                            r.analysis.summary.stance === 'constructive'
                              ? 'positive'
                              : r.analysis.summary.stance === 'avoid'
                                ? 'negative'
                                : r.analysis.summary.stance === 'cautious'
                                  ? 'warn'
                                  : 'ai'
                          }
                        >
                          {r.analysis.summary.stance}
                        </Chip>
                      </td>
                      <td className="py-2 text-right font-mono text-ai">
                        {(r.analysis.confidence.score.value * 100).toFixed(0)}%
                      </td>
                      <td className="py-2 text-right font-mono text-market">
                        {r.analysis.dataQuality.grade}
                      </td>
                      <td className="py-2 text-right font-mono text-muted">
                        {m.decisionLedger?.calibration.brierScore?.toFixed(3) ?? '—'}
                      </td>
                      <td
                        className={cx(
                          'py-2 text-right font-mono',
                          bestEdge(r) > 0 ? 'text-positive' : 'text-negative',
                        )}
                      >
                        {bestEdge(r).toFixed(2)}%
                      </td>
                      <td className="py-2 text-right font-mono text-muted">
                        {r.analysis.riskAssessment.level}
                      </td>
                      <td className="py-2 text-right">
                        {r.outcome ? (
                          <Chip tone={r.outcome.outcome === 1 ? 'positive' : 'negative'}>
                            {r.outcome.outcome === 1 ? 'hit' : 'miss'} · {r.outcome.measurement.verdict}
                          </Chip>
                        ) : (
                          <Chip tone="neutral">unresolved</Chip>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}

          {comparison.length === 2 ? (
            <Panel tone="ai" className="p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <ArrowLeftRight size={15} className="text-ai" aria-hidden />
                  Comparison
                </h3>
                <OriginTag origin="deterministic" label="numbers are deterministic" />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px]">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-[0.12em] text-faint">
                        <th scope="col" className="py-1.5 text-left font-medium">Metric</th>
                        <th scope="col" className="py-1.5 text-right font-medium">{comparison[0].id.slice(-8)}</th>
                        <th scope="col" className="py-1.5 text-right font-medium">{comparison[1].id.slice(-8)}</th>
                        <th scope="col" className="py-1.5 text-right font-medium">Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      <CompareCell
                        label="Confidence"
                        a={comparison[0].analysis.confidence.score.value * 100}
                        b={comparison[1].analysis.confidence.score.value * 100}
                        format={(v) => `${v.toFixed(1)}%`}
                      />
                      <CompareCell
                        label="Data quality score"
                        a={comparison[0].analysis.dataQuality.score.value * 100}
                        b={comparison[1].analysis.dataQuality.score.value * 100}
                        format={(v) => v.toFixed(1)}
                      />
                      <CompareCell
                        label="Best edge"
                        a={bestEdge(comparison[0])}
                        b={bestEdge(comparison[1])}
                        format={(v) => `${v.toFixed(2)}%`}
                      />
                      <CompareCell
                        label="Risk score"
                        a={comparison[0].analysis.riskAssessment.score.value * 100}
                        b={comparison[1].analysis.riskAssessment.score.value * 100}
                        higherIsBetter={false}
                        format={(v) => v.toFixed(1)}
                      />
                      <CompareCell
                        label="Correlation score"
                        a={comparison[0].analysis.correlationAssessment.score.value * 100}
                        b={comparison[1].analysis.correlationAssessment.score.value * 100}
                        higherIsBetter={false}
                        format={(v) => v.toFixed(1)}
                      />
                      <CompareCell
                        label="Freshness (min)"
                        a={comparison[0].analysis.dataQuality.freshnessMinutes.value}
                        b={comparison[1].analysis.dataQuality.freshnessMinutes.value}
                        higherIsBetter={false}
                        format={(v) => v.toFixed(0)}
                      />
                    </tbody>
                  </table>
                </div>
                <div className="space-y-3">
                  {comparison.map((r) => (
                    <div key={r.id} className="rounded-lg border border-ai/25 bg-ai/[0.05] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] text-ai">{r.id}</span>
                        <span className="font-mono text-[10px] text-faint">
                          {dateTime(r.analysis.generatedAt)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs font-medium text-foreground">
                        {r.analysis.summary.headline}
                      </p>
                      <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-muted">
                        {r.analysis.summary.narrative[1]}
                      </p>
                      <div className="mt-2">
                        <Meter value={r.analysis.confidence.score.value} ariaLabel="confidence" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          ) : (
            <p className="text-[11px] text-faint">
              {comparison.length === 1
                ? 'Select one more analysis to see a side-by-side comparison.'
                : 'Tick two rows to compare.'}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {missions.length === 0 ? (
            <EmptyState title="No mission history" detail="Missions appear here as soon as one is drafted." />
          ) : (
            <Panel className="overflow-x-auto p-5">
              <table className="w-full min-w-[900px] text-left">
                <caption className="sr-only">Mission history</caption>
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.12em] text-faint">
                    <th scope="col" className="py-1.5 font-medium">Mission</th>
                    <th scope="col" className="py-1.5 font-medium">Target</th>
                    <th scope="col" className="py-1.5 font-medium">Status</th>
                    <th scope="col" className="py-1.5 font-medium">Approval</th>
                    <th scope="col" className="py-1.5 font-medium">Decision</th>
                    <th scope="col" className="py-1.5 font-medium">Ledger</th>
                    <th scope="col" className="py-1.5 font-medium">Transitions</th>
                    <th scope="col" className="py-1.5 text-right font-medium">CLV</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Brier</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Objective</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Learning</th>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {missions.map((m) => (
                    <tr key={m.id} className="border-t border-line-soft">
                      <td className="py-2 pr-2">
                        <Link to={`/missions/${m.id}`} className="font-mono text-[11px] text-mission hover:underline">
                          {m.id}
                        </Link>
                        <span className="block text-[10px] text-faint">
                          {relativeTime(m.createdAt)}
                        </span>
                      </td>
                      <td className="py-2 pr-2">
                        <span className="block text-foreground">{m.target.eventLabel}</span>
                        <span className="block text-[10px] text-faint">
                          {m.target.marketLabel}
                          {m.target.selectionLabel ? ` · ${m.target.selectionLabel}` : ''}
                        </span>
                      </td>
                      <td className="py-2 pr-2">
                        <MissionStatusBadge status={m.status} />
                      </td>
                      <td className="py-2 pr-2">
                        <Chip
                          tone={
                            m.approval.state === 'APPROVED'
                              ? 'positive'
                              : m.approval.state === 'REJECTED'
                                ? 'negative'
                                : 'warn'
                          }
                        >
                          {m.approval.state}
                        </Chip>
                        <span className="mt-1 block text-[10px] text-faint">
                          {m.approval.decidedBy ?? m.approval.requestedBy ?? '—'}
                        </span>
                      </td>
                      <td className="py-2 pr-2">
                        {m.decisionPacket ? (
                          <Chip tone={m.decisionPacket.status === 'READY' ? 'positive' : m.decisionPacket.status === 'CAUTION' ? 'warn' : 'negative'}>
                            {m.decisionPacket.status}
                          </Chip>
                        ) : (
                          <span className="text-faint">legacy</span>
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        {m.decisionLedger ? (
                          <div className="space-y-1">
                            <span className="font-mono text-[10px] text-ai">{m.decisionLedger.id}</span>
                            <span className="block text-[10px] text-faint">{m.decisionLedger.settlement.status}</span>
                          </div>
                        ) : <span className="text-faint">—</span>}
                      </td>
                      <td className="py-2 pr-2 font-mono text-[10px] text-muted">
                        {m.history.map((h) => h.to.slice(0, 4)).join('→')}
                      </td>
                      <td
                        className={cx(
                          'py-2 text-right font-mono',
                          (m.measurement?.closingLineValuePct.value ?? 0) > 0 ? 'text-positive' : 'text-negative',
                        )}
                      >
                        {m.measurement?.closingLineValuePct.formatted ?? '—'}
                      </td>
                      <td className="py-2 text-right">
                        {m.measurement ? (
                          <Chip tone={m.measurement.objectiveMet ? 'positive' : 'warn'}>
                            {m.measurement.objectiveMet ? 'met' : 'not met'}
                          </Chip>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                      <td className="py-2 text-right font-mono text-[10px] text-muted">
                        {m.learning.outcomeFeedback}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}

          <Panel className="p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Trophy size={15} className="text-positive" aria-hidden />
              Lessons captured by the learning loop
            </h3>
            {missions.some((m) => m.learning.lessons.length) ? (
              <ul className="space-y-2">
                {missions
                  .filter((m) => m.learning.lessons.length)
                  .map((m) => (
                    <li key={m.id} className="rounded-lg border border-line bg-surface-2 px-3 py-2">
                      <span className="font-mono text-[10px] text-mission">{m.id}</span>
                      <ul className="mt-1 space-y-1">
                        {m.learning.lessons.map((l) => (
                          <li key={l} className="text-[11px] text-muted">
                            · {l}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-[11px] text-faint">
                Lessons are published by the Core Engine client once a mission completes.
              </p>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
