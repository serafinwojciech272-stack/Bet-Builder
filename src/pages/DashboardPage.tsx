import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Brain,
  CheckCircle2,
  Database,
  Eye,
  Radar,
  ShieldAlert,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { useIntelligence } from '../state/IntelligenceProvider';
import {
  buildEventIntel,
  dataQualityAlerts,
  notableMovements,
  riskAlerts,
  topValueSignals,
} from '../state/selectors';
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  LoadingState,
  Meter,
  OriginTag,
  Panel,
  SectionHeading,
  StaleBanner,
  Stat,
} from '../components/ui';
import { MissionCard } from '../components/MissionUI';
import { cx, dateTime, relativeTime } from '../lib/format';

export function DashboardPage() {
  const { dataset, phase, error, refresh, analyses, missions, nowTick, analysisJobs, runAnalysis } =
    useIntelligence();

  const intel = useMemo(() => (dataset ? buildEventIntel(dataset, new Date(nowTick)) : []), [dataset, nowTick]);
  const monitored = useMemo(() => intel.filter((i) => i.event.monitored), [intel]);
  const movements = useMemo(() => notableMovements(intel), [intel]);
  const values = useMemo(() => topValueSignals(intel), [intel]);
  const qualityAlerts = useMemo(() => dataQualityAlerts(intel), [intel]);
  const risks = useMemo(() => riskAlerts(intel), [intel]);

  const awaiting = useMemo(
    () => missions.filter((m) => m.status === 'AWAITING_APPROVAL' || m.status === 'DRAFT'),
    [missions],
  );
  const active = useMemo(
    () => missions.filter((m) => ['APPROVED', 'EXECUTING', 'MEASURING'].includes(m.status)),
    [missions],
  );
  const completed = useMemo(() => missions.filter((m) => m.status === 'COMPLETED'), [missions]);
  const resolved = useMemo(() => analyses.filter((a) => a.outcome), [analyses]);

  const staleMinutes = useMemo(() => {
    if (!intel.length) return 0;
    return Math.max(...intel.map((i) => i.quality.freshnessMinutes.value));
  }, [intel]);

  if (phase === 'loading' || phase === 'idle') {
    return (
      <div className="space-y-6">
        <LoadingState label="Normalizing provider feed and rebuilding canonical dataset…" rows={2} />
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Panel key={i} className="h-40 p-5">
              <LoadingState rows={2} label="" />
            </Panel>
          ))}
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <ErrorState
        title="Canonical dataset unavailable"
        detail={error ?? 'The normalization pipeline did not return a dataset.'}
        onRetry={() => void refresh()}
        retryLabel="Retry pipeline"
      />
    );
  }

  return (
    <div className="space-y-8">
      <section className="rise">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Intelligence Dashboard
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Live monitoring surface across the canonical sports domain. Deterministic services
              produce every number; the intelligence layer interprets them and proposes missions.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip tone="ai">
              <Brain size={11} aria-hidden />
              {analyses.length} analyses stored
            </Chip>
            <Chip tone="mission">
              <Radar size={11} aria-hidden />
              {missions.length} missions
            </Chip>
            <Chip tone="market">
              <Database size={11} aria-hidden />
              {dataset?.snapshots.length ?? 0} snapshots
            </Chip>
          </div>
        </div>
      </section>

      {staleMinutes > 30 ? <StaleBanner minutes={staleMinutes} onRefresh={() => void refresh()} /> : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: 'Monitored events', value: monitored.length, hint: `${intel.length} normalized`, icon: Eye, tone: 'default' as const },
          { label: 'Value signals', value: values.length, hint: 'tier ≥ marginal', icon: Sparkles, tone: 'positive' as const },
          { label: 'Quality alerts', value: qualityAlerts.length, hint: 'warning or worse', icon: Database, tone: 'market' as const },
          { label: 'Risk alerts', value: risks.length, hint: 'elevated or high', icon: ShieldAlert, tone: 'negative' as const },
          { label: 'Awaiting approval', value: awaiting.length, hint: `${active.length} in flight`, icon: Radar, tone: 'ai' as const },
        ].map((k) => (
          <Panel key={k.label} className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <k.icon size={15} className="text-faint" aria-hidden />
            </div>
            <Stat label={k.label} value={k.value} hint={k.hint} tone={k.tone} />
          </Panel>
        ))}
      </section>

      {/* -------------------------------------------------- monitored events */}
      <section>
        <SectionHeading
          index="01"
          title="Monitored events"
          subtitle="Canonical events under active observation with deterministic movement, quality and risk read-outs."
          icon={<Eye size={17} className="text-ai" aria-hidden />}
          action={
            <Link to="/events" className="text-xs text-ai hover:underline">
              Browse all events →
            </Link>
          }
        />
        {monitored.length === 0 ? (
          <EmptyState title="No monitored events" detail="Nothing in the canonical dataset is flagged for monitoring." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {monitored.map((i) => {
              const job = analysisJobs[i.event.id];
              const latest = analyses.find((a) => a.eventId === i.event.id);
              const best = [...i.value.signals].sort((a, b) => b.edgePct.value - a.edgePct.value)[0];
              return (
                <Panel key={i.event.id} className="flex flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip tone="neutral">{i.event.league.name}</Chip>
                        {i.event.status === 'live' ? (
                          <Chip tone="negative">
                            <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-negative" />
                            live
                          </Chip>
                        ) : (
                          <span className="font-mono text-[10px] text-faint">
                            {relativeTime(i.event.startTime, nowTick)}
                          </span>
                        )}
                      </div>
                      <h3 className="mt-1.5 truncate text-sm font-semibold text-foreground">
                        {i.event.homeTeam.name} vs {i.event.awayTeam.name}
                      </h3>
                      <p className="truncate text-[11px] text-muted">{i.marketLabel} · {i.event.venue}</p>
                    </div>
                    <Chip tone={i.quality.grade === 'A' ? 'positive' : i.quality.grade === 'B' ? 'ai' : i.quality.grade === 'C' ? 'warn' : 'negative'}>
                      {i.quality.grade}
                    </Chip>
                  </div>

                  <dl className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-[11px]">
                    <div>
                      <dt className="text-[9px] uppercase tracking-wider text-faint">Max Δ</dt>
                      <dd className={cx(Math.abs(i.movement?.maxAbsChangePct.value ?? 0) > 4 ? 'text-negative' : 'text-market')}>
                        {i.movement?.maxAbsChangePct.formatted ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[9px] uppercase tracking-wider text-faint">Best edge</dt>
                      <dd className={cx((best?.edgePct.value ?? 0) > 0 ? 'text-positive' : 'text-muted')}>
                        {i.market === null ? 'No odds' : best?.edgePct.formatted ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[9px] uppercase tracking-wider text-faint">Risk</dt>
                      <dd className={cx(i.risk.level === 'HIGH' ? 'text-negative' : i.risk.level === 'ELEVATED' ? 'text-warn' : 'text-muted')}>
                        {i.risk.level}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-[10px] text-faint">
                      <span>feed quality</span>
                      <span className="font-mono">{(i.quality.score.value * 100).toFixed(0)}/100</span>
                    </div>
                    <Meter value={i.quality.score.value} tone={i.quality.score.value > 0.7 ? 'ai' : 'warn'} ariaLabel="feed quality" />
                  </div>

                  {latest ? (
                    <div className="mt-3 rounded-lg bg-ai/[0.07] px-3 py-2 ring-1 ring-ai/25">
                      <OriginTag origin="ai-inference" label="latest AI read" />
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-foreground/85">
                        {latest.analysis.summary.headline}
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-faint">
                        {relativeTime(latest.analysis.generatedAt, nowTick)} · confidence{' '}
                        {(latest.analysis.confidence.score.value * 100).toFixed(0)}%
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 rounded-lg border border-dashed border-line px-3 py-2 text-[11px] text-faint">
                      No analysis on record for this event yet.
                    </p>
                  )}

                  {job?.status === 'error' ? (
                    <div className="mt-2">
                      <ErrorState
                        title="Analysis failed"
                        detail={job.error}
                        onRetry={() => void runAnalysis(i.event.id)}
                      />
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2 pt-1">
                    <Link
                      to={`/analysis/${i.event.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-ai/15 px-3 py-1.5 text-xs font-medium text-ai ring-1 ring-ai/45 transition-colors hover:bg-ai/25"
                    >
                      <BarChart3 size={13} aria-hidden />
                      Open analysis
                    </Link>
                    <Button
                      variant="ghost"
                      icon={<Sparkles size={13} />}
                      loading={job?.status === 'loading'}
                      onClick={() => void runAnalysis(i.event.id)}
                    >
                      Run AI pass
                    </Button>
                  </div>
                </Panel>
              );
            })}
          </div>
        )}
      </section>

      {/* ------------------------------------------- movements & value grid */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Panel tone="market" className="p-5">
          <SectionHeading
            index="02"
            title="Notable odds movements"
            subtitle="Reliability-weighted consensus drift since open."
            icon={<Activity size={16} className="text-market" aria-hidden />}
            action={<OriginTag origin="deterministic" label="movement-service" />}
          />
          {movements.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.12em] text-faint">
                    <th scope="col" className="py-1 font-medium">Event</th>
                    <th scope="col" className="py-1 font-medium">Selection</th>
                    <th scope="col" className="py-1 text-right font-medium">Open</th>
                    <th scope="col" className="py-1 text-right font-medium">Now</th>
                    <th scope="col" className="py-1 text-right font-medium">Δ</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  {movements.map((m) => (
                    <tr key={`${m.eventId}-${m.selectionId}`} className="border-t border-line-soft">
                      <td className="py-1.5 pr-2">
                        <Link to={`/analysis/${m.eventId}`} className="font-sans text-foreground hover:text-ai">
                          {m.eventLabel}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-2 font-sans text-muted">
                        {m.label}
                        {m.steam ? <Chip tone="negative" className="ml-1.5">steam</Chip> : null}
                      </td>
                      <td className="py-1.5 text-right text-muted">{m.openingPrice}</td>
                      <td className="py-1.5 text-right text-market">{m.currentPrice}</td>
                      <td className={cx('py-1.5 text-right', m.changePct < 0 ? 'text-positive' : 'text-negative')}>
                        {m.changeLabel}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No movement captured" detail="Snapshots exist but no price has changed yet." />
          )}
        </Panel>

        <Panel className="p-5">
          <SectionHeading
            index="03"
            title="Value signals"
            subtitle="Model probability versus best available price, haircut by feed quality."
            icon={<Sparkles size={16} className="text-ai" aria-hidden />}
            action={<OriginTag origin="deterministic" label="value-service" />}
          />
          {values.length ? (
            <ul className="space-y-2">
              {values.map((v) => (
                <li
                  key={`${v.eventId}-${v.label}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2"
                >
                  <div className="min-w-0">
                    <Link to={`/analysis/${v.eventId}`} className="text-xs font-medium text-foreground hover:text-ai">
                      {v.label}
                    </Link>
                    <p className="truncate text-[11px] text-muted">
                      {v.eventLabel} · best {v.bestPrice} · grade {v.grade}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[11px]">
                    <span className="text-ai" title="model probability">{v.modelProbability}</span>
                    <span className="text-market" title="implied probability">{v.impliedProbability}</span>
                    <span className="text-positive" title="edge">{v.edgeLabel}</span>
                    <Chip tone={v.tier === 'strong' ? 'positive' : v.tier === 'moderate' ? 'ai' : 'warn'}>
                      {v.tier}
                    </Chip>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No value signals" detail="No selection currently clears the edge threshold." />
          )}
        </Panel>
      </section>

      {/* -------------------------------------------------------- alert grid */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-5">
          <SectionHeading
            index="04"
            title="Data-quality alerts"
            icon={<Database size={16} className="text-market" aria-hidden />}
          />
          {qualityAlerts.length ? (
            <ul className="space-y-2">
              {qualityAlerts.map((a) => (
                <li
                  key={a.id}
                  className={cx(
                    'flex items-start gap-2 rounded-lg px-3 py-2 text-[11px]',
                    a.severity === 'error'
                      ? 'bg-negative/[0.07] ring-1 ring-negative/25'
                      : 'bg-warn/[0.07] ring-1 ring-warn/25',
                  )}
                >
                  <AlertTriangle size={12} className={cx('mt-0.5 shrink-0', a.severity === 'error' ? 'text-negative' : 'text-warn')} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <Link to={`/analysis/${a.eventId}`} className="font-medium text-foreground hover:text-ai">
                      {a.eventLabel}
                    </Link>
                    <p className="text-muted">{a.message}</p>
                  </div>
                  <span className="font-mono text-[9px] uppercase text-faint">{a.kind}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Feeds are clean" detail="No warning-level data-quality issues detected." icon={<CheckCircle2 size={22} />} />
          )}
        </Panel>

        <Panel className="p-5">
          <SectionHeading
            index="05"
            title="Risk alerts"
            icon={<ShieldAlert size={16} className="text-negative" aria-hidden />}
          />
          {risks.length ? (
            <ul className="space-y-2">
              {risks.map((a) => (
                <li key={a.id} className="rounded-lg bg-surface-2 px-3 py-2 ring-1 ring-line">
                  <div className="flex items-center justify-between gap-2">
                    <Link to={`/analysis/${a.eventId}`} className="text-xs font-medium text-foreground hover:text-ai">
                      {a.eventLabel}
                    </Link>
                    <Chip tone={a.severity === 'error' ? 'negative' : 'warn'}>{a.kind}</Chip>
                  </div>
                  <p className="mt-1 text-[11px] text-muted">{a.message}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Risk surface is calm" detail="No event is currently rated elevated or high." icon={<CheckCircle2 size={22} />} />
          )}
        </Panel>
      </section>

      {/* --------------------------------------------------------- missions */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div>
          <SectionHeading
            index="06"
            title="Missions awaiting approval"
            subtitle="Nothing executes until a human clears the gate."
            icon={<Radar size={16} className="text-warn" aria-hidden />}
            action={<Link to="/missions" className="text-xs text-ai hover:underline">All missions →</Link>}
          />
          {awaiting.length ? (
            <div className="space-y-3">
              {awaiting.map((m) => (
                <MissionCard
                  key={m.id}
                  mission={m}
                  nowTick={nowTick}
                  footer={
                    <Link
                      to={`/missions/${m.id}`}
                      className="inline-flex items-center gap-1 text-xs text-mission hover:underline"
                    >
                      Open approval gate <ArrowUpRight size={12} aria-hidden />
                    </Link>
                  }
                />
              ))}
            </div>
          ) : (
            <EmptyState title="Approval queue is empty" detail="Draft a mission from any event analysis." />
          )}
        </div>

        <div>
          <SectionHeading
            index="07"
            title="Active & completed missions"
            subtitle="Execution, measurement and learning records from the Core Engine client."
            icon={<Trophy size={16} className="text-positive" aria-hidden />}
          />
          <div className="space-y-3">
            {active.map((m) => (
              <MissionCard key={m.id} mission={m} nowTick={nowTick} />
            ))}
            {completed.slice(0, 3).map((m) => (
              <MissionCard key={m.id} mission={m} nowTick={nowTick} />
            ))}
            {!active.length && !completed.length ? (
              <EmptyState title="No missions in flight" detail="Approved missions and their measurements land here." />
            ) : null}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------- historical outcomes */}
      <section>
        <SectionHeading
          index="08"
          title="Historical outcomes"
          subtitle="Resolved analyses scored by the deterministic measurement service."
          icon={<Trophy size={16} className="text-positive" aria-hidden />}
          action={<Link to="/history" className="text-xs text-ai hover:underline">Full history →</Link>}
        />
        {resolved.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.12em] text-faint">
                  <th scope="col" className="py-1.5 font-medium">Analysis</th>
                  <th scope="col" className="py-1.5 font-medium">Event</th>
                  <th scope="col" className="py-1.5 font-medium">Selection</th>
                  <th scope="col" className="py-1.5 text-right font-medium">Model</th>
                  <th scope="col" className="py-1.5 text-right font-medium">CLV</th>
                  <th scope="col" className="py-1.5 text-right font-medium">Brier</th>
                  <th scope="col" className="py-1.5 text-right font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {resolved.map((r) => {
                  const est = r.analysis.probabilityEstimates.find(
                    (p) => p.selectionId === r.outcome?.selectionId,
                  );
                  return (
                    <tr key={r.id} className="border-t border-line-soft">
                      <td className="py-2 pr-2">
                        <Link to={`/history?analysis=${r.id}`} className="font-sans text-ai hover:underline">
                          {r.id}
                        </Link>
                        <div className="text-[10px] text-faint">{dateTime(r.analysis.generatedAt)}</div>
                      </td>
                      <td className="py-2 pr-2 font-sans text-foreground">{r.analysis.context.eventLabel}</td>
                      <td className="py-2 pr-2 font-sans text-muted">{r.outcome?.selectionLabel}</td>
                      <td className="py-2 text-right text-ai">{est?.modelProbability.formatted ?? '—'}</td>
                      <td
                        className={cx(
                          'py-2 text-right',
                          (r.outcome?.measurement.closingLineValuePct.value ?? 0) > 0 ? 'text-positive' : 'text-negative',
                        )}
                      >
                        {r.outcome?.measurement.closingLineValuePct.formatted}
                      </td>
                      <td className="py-2 text-right text-muted">
                        {r.outcome?.measurement.brierScore?.formatted ?? '—'}
                      </td>
                      <td className="py-2 text-right">
                        <Chip tone={r.outcome?.outcome === 1 ? 'positive' : 'negative'}>
                          {r.outcome?.outcome === 1 ? 'hit' : 'miss'}
                        </Chip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No resolved analyses yet" detail="Outcomes appear once measurement completes." />
        )}
      </section>
    </div>
  );
}
