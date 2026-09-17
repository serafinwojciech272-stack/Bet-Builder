import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Activity,
  Brain,
  CalendarClock,
  Database,
  Gauge,
  ListChecks,
  MapPin,
  Rocket,
  ShieldAlert,
  Sparkles,
  Target,
  Waves,
} from 'lucide-react';
import { useIntelligence } from '../state/IntelligenceProvider';
import { buildEventIntel } from '../state/selectors';
import { latestQuotesBySelection } from '../domain/services/oddsMath';
import { BOOKMAKERS, MARKET_LABELS, SPORT_LABELS } from '../domain/feed/normalization';
import {
  AISummaryBlock,
  AssumptionsCard,
  CorrelationCard,
  DataQualityCard,
  KeyFactorsCard,
  MarketMovementCard,
  ModelVsMarketCard,
  NegativeSignalsCard,
  PositiveSignalsCard,
  RiskCard,
  WarningsCard,
} from '../components/AIBlocks';
import { MissionBuilder } from '../components/MissionBuilder';
import { MissionCard } from '../components/MissionUI';
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  LoadingState,
  OriginTag,
  Panel,
  PartialDataBanner,
  SectionHeading,
  StaleBanner,
  Stat,
} from '../components/ui';
import { cx, dateTime, relativeTime } from '../lib/format';

const SECTIONS = [
  { id: 'overview', label: '01 Event overview' },
  { id: 'market', label: '02 Market intelligence' },
  { id: 'movement', label: '03 Odds movement' },
  { id: 'model', label: '04 Model probabilities' },
  { id: 'value', label: '05 Value analysis' },
  { id: 'risk', label: '06 Risk & correlation' },
  { id: 'reasoning', label: '07 AI reasoning' },
  { id: 'actions', label: '08 Recommended actions' },
  { id: 'mission', label: '09 Mission creation' },
];

export function EventAnalysisPage() {
  const { eventId = '' } = useParams();
  const {
    dataset,
    phase,
    error,
    refresh,
    analyses,
    missions,
    analysisJobs,
    runAnalysis,
    nowTick,
  } = useIntelligence();
  const [autoRan, setAutoRan] = useState(false);

  const intel = useMemo(() => (dataset ? buildEventIntel(dataset, new Date(nowTick)) : []), [dataset, nowTick]);
  const eventIntel = useMemo(() => intel.find((i) => i.event.id === eventId) ?? null, [intel, eventId]);
  const record = useMemo(
    () =>
      analyses
        .filter((a) => a.eventId === eventId)
        .sort((a, b) => b.analysis.generatedAt.localeCompare(a.analysis.generatedAt))[0] ?? null,
    [analyses, eventId],
  );
  const eventMissions = useMemo(
    () => missions.filter((m) => m.target.eventId === eventId),
    [missions, eventId],
  );
  const job = analysisJobs[eventId];

  useEffect(() => {
    if (phase === 'ready' && eventIntel && !record && !job && !autoRan) {
      setAutoRan(true);
      void runAnalysis(eventId);
    }
  }, [phase, eventIntel, record, job, autoRan, runAnalysis, eventId]);

  if (phase === 'loading' || phase === 'idle') {
    return <LoadingState label="Loading canonical event…" rows={4} />;
  }
  if (phase === 'error') {
    return <ErrorState detail={error ?? undefined} onRetry={() => void refresh()} />;
  }
  if (!eventIntel) {
    return (
      <EmptyState
        title="Event not found in the canonical domain"
        detail={`No normalized event matches id ${eventId}. It may have been dropped during normalization.`}
        action={
          <Link to="/events" className="text-xs text-ai hover:underline">
            ← Back to events
          </Link>
        }
      />
    );
  }

  const { event, market, movement, quality, model, value, risk } = eventIntel;
  const analysis = record?.analysis ?? null;
  const snapshots = dataset?.snapshots.filter((s) => s.eventId === event.id && s.market === market) ?? [];
  const selectionIds = movement?.selections.map((s) => s.selectionId) ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ai">
          <ArrowLeft size={13} aria-hidden />
          Back to intelligence dashboard
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button
            icon={<Sparkles size={13} />}
            loading={job?.status === 'loading'}
            onClick={() => void runAnalysis(eventId)}
          >
            {analysis ? 'Re-run analysis' : 'Run analysis'}
          </Button>
          <Button
            variant="ghost"
            icon={<Brain size={13} />}
            loading={job?.status === 'loading'}
            onClick={() => void runAnalysis(eventId, { depth: 'deep' })}
            title="Deep pass — same contract, longer engine budget"
          >
            Deep pass
          </Button>
        </div>
      </div>

      <nav aria-label="Analysis sections" className="sticky top-[86px] z-20 -mx-1 overflow-x-auto">
        <ul className="flex gap-1 rounded-xl border border-line bg-surface/90 p-1 backdrop-blur">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="block whitespace-nowrap rounded-lg px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-faint transition-colors hover:bg-surface-3 hover:text-ai"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {quality.stale ? <StaleBanner minutes={quality.freshnessMinutes.value} onRefresh={() => void refresh()} /> : null}
      {analysis?.meta.partial ? <PartialDataBanner reasons={analysis.meta.degradedReasons} /> : null}

      {/* ------------------------------------------------ 01 event overview */}
      <section id="overview" className="scroll-mt-40">
        <SectionHeading
          index="01"
          title="Event overview"
          subtitle="Canonical record produced by the normalization layer."
          icon={<CalendarClock size={17} className="text-ai" aria-hidden />}
          action={<OriginTag origin="deterministic" label="canonical domain" />}
        />
        <Panel className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone="neutral">{SPORT_LABELS[event.sportKey]}</Chip>
                <Chip tone="neutral">{event.league.name}</Chip>
                <Chip tone={event.status === 'live' ? 'negative' : 'ai'}>{event.status}</Chip>
                <Chip tone={event.monitored ? 'positive' : 'neutral'}>
                  {event.monitored ? 'monitored' : 'not monitored'}
                </Chip>
              </div>
              <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
                {event.homeTeam.name} <span className="text-faint">vs</span> {event.awayTeam.name}
              </h1>
              <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
                <span className="flex items-center gap-1">
                  <MapPin size={12} aria-hidden />
                  {event.venue}
                </span>
                <span className="flex items-center gap-1">
                  <CalendarClock size={12} aria-hidden />
                  {dateTime(event.startTime)} · {relativeTime(event.startTime, nowTick)}
                </span>
                <span className="font-mono text-faint">{event.id}</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <Stat label="Home rating" value={event.homeTeam.rating} hint={event.homeTeam.form.join(' ')} />
              <Stat label="Away rating" value={event.awayTeam.rating} hint={event.awayTeam.form.join(' ')} />
              <Stat label="Liquidity" value={`${(event.liquidity * 100).toFixed(0)}%`} hint="modelled index" tone="market" />
              <Stat
                label="Unavailable"
                value={event.homeTeam.injuriesOut + event.awayTeam.injuriesOut}
                hint="players out"
              />
            </div>
          </div>
        </Panel>
      </section>

      {/* -------------------------------------------- 02 market intelligence */}
      <section id="market" className="scroll-mt-40">
        <SectionHeading
          index="02"
          title="Market intelligence"
          subtitle={`Latest quote per bookmaker on ${MARKET_LABELS[market]}, with reliability-weighted consensus.`}
          icon={<Database size={17} className="text-market" aria-hidden />}
          action={<OriginTag origin="deterministic" label="odds-math" />}
        />
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel tone="market" className="p-5 lg:col-span-2">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left">
                <caption className="sr-only">Latest bookmaker prices</caption>
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.12em] text-faint">
                    <th scope="col" className="py-1.5 font-medium">Bookmaker</th>
                    {selectionIds.map((sel) => (
                      <th key={sel} scope="col" className="py-1.5 text-right font-medium">
                        {movement?.selections.find((s) => s.selectionId === sel)?.label ?? sel}
                      </th>
                    ))}
                    <th scope="col" className="py-1.5 text-right font-medium">Captured</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  {(movement?.bookmakersTracked ?? []).map((book) => {
                    const rows = selectionIds.map((sel) =>
                      latestQuotesBySelection(snapshots, sel).find((l) => l.bookmaker === book),
                    );
                    const captured = rows.find((r) => r)?.capturedAt;
                    return (
                      <tr key={book} className="border-t border-line-soft">
                        <td className="py-1.5 pr-2 font-sans text-foreground">{BOOKMAKERS[book].name}</td>
                        {rows.map((r, i) => (
                          <td key={i} className="py-1.5 text-right text-market">
                            {r ? r.quote.decimalOdds.toFixed(2) : <span className="text-negative">—</span>}
                          </td>
                        ))}
                        <td className="py-1.5 text-right text-faint">
                          {captured ? relativeTime(captured, nowTick) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t border-market/30">
                    <td className="py-1.5 pr-2 font-sans font-semibold text-market">Consensus</td>
                    {value.signals.map((s) => (
                      <td key={s.selectionId} className="py-1.5 text-right font-semibold text-market">
                        {s.consensusPrice.formatted}
                      </td>
                    ))}
                    <td className="py-1.5 text-right text-faint">weighted</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Overround" tone="market" value={`${(value.overround.value * 100).toFixed(1)}%`} hint="book margin" />
              <Stat label="Snapshots" tone="market" value={movement?.snapshotCount.formatted ?? '0'} hint={`${movement?.bookmakersTracked.length ?? 0} books`} />
              <Stat label="Latency" tone="market" value={`${quality.avgLatencyMs.formatted}ms`} hint="avg feed" />
              <Stat label="Dispersion" tone="market" value={`${(quality.dispersion.value * 100).toFixed(1)}%`} hint="cross-book" />
            </div>
          </Panel>

          <Panel className="p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Gauge size={15} className="text-market" aria-hidden />
              Source snapshots
            </h3>
            <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {snapshots
                .slice()
                .reverse()
                .slice(0, 16)
                .map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-2.5 py-1.5 font-mono text-[10px]">
                    <span className="truncate text-muted">{s.id}</span>
                    <span className="shrink-0 text-faint">
                      {BOOKMAKERS[s.bookmaker].name} · {relativeTime(s.capturedAt, nowTick)}
                    </span>
                  </li>
                ))}
            </ul>
          </Panel>
        </div>
      </section>

      {analysis ? (
        <>
          {/* ------------------------------------------- 03 odds movement */}
          <section id="movement" className="scroll-mt-40">
            <SectionHeading
              index="03"
              title="Odds movement"
              subtitle="Consensus price path since the first capture."
              icon={<Waves size={17} className="text-market" aria-hidden />}
            />
            <MarketMovementCard analysis={analysis} />
          </section>

          {/* -------------------------------------- 04 model probabilities */}
          <section id="model" className="scroll-mt-40">
            <SectionHeading
              index="04"
              title="Model probabilities"
              subtitle={`Deterministic estimates from ${model.modelVersion} · inputs digest ${model.inputsDigest}`}
              icon={<Target size={17} className="text-ai" aria-hidden />}
              action={<OriginTag origin="deterministic" label="probability-service" />}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <ModelVsMarketCard analysis={analysis} />
              <Panel className="p-5">
                <h3 className="mb-3 text-sm font-semibold">Probability drivers</h3>
                <ul className="space-y-3">
                  {analysis.probabilityEstimates.map((p) => (
                    <li key={p.selectionId} className="rounded-lg border border-line bg-surface-2 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-foreground">{p.label}</span>
                        <span className="font-mono text-[11px] text-ai">
                          fair {p.modelFairOdds.formatted}
                        </span>
                      </div>
                      <ul className="mt-2 space-y-1">
                        {p.drivers.map((d) => (
                          <li key={d.label} className="flex items-center justify-between text-[11px]">
                            <span className="text-muted">{d.label}</span>
                            <span className="font-mono text-faint">{d.contribution.formatted}</span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          </section>

          {/* ------------------------------------------- 05 value analysis */}
          <section id="value" className="scroll-mt-40">
            <SectionHeading
              index="05"
              title="Value analysis"
              subtitle="Edge = model probability − implied probability at the best available price, then haircut by feed quality."
              icon={<Sparkles size={17} className="text-positive" aria-hidden />}
              action={<OriginTag origin="deterministic" label="value-service" />}
            />
            <Panel className="overflow-x-auto p-5">
              <table className="w-full min-w-[760px] text-left">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.12em] text-faint">
                    <th scope="col" className="py-1.5 font-medium">Selection</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Best</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Book</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Model</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Implied</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Edge</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Q-adj</th>
                    <th scope="col" className="py-1.5 text-right font-medium">EV</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Kelly</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Tier</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  {analysis.valueSignals.map((s) => (
                    <tr key={s.selectionId} className="border-t border-line-soft">
                      <td className="py-2 pr-2 font-sans text-foreground">{s.label}</td>
                      <td className="py-2 text-right text-market">{s.bestPrice.formatted}</td>
                      <td className="py-2 text-right font-sans text-muted">{s.bestBookmaker ?? '—'}</td>
                      <td className="py-2 text-right text-ai">{s.edgePct.value >= 0 ? '' : ''}{analysis.probabilityEstimates.find((p) => p.selectionId === s.selectionId)?.modelProbability.formatted}</td>
                      <td className="py-2 text-right text-market">
                        {analysis.probabilityEstimates.find((p) => p.selectionId === s.selectionId)?.impliedProbability.formatted}
                      </td>
                      <td className={cx('py-2 text-right', s.edgePct.value > 0 ? 'text-positive' : 'text-negative')}>
                        {s.edgePct.formatted}
                      </td>
                      <td className="py-2 text-right text-muted">{s.qualityAdjustedEdgePct.formatted}</td>
                      <td className={cx('py-2 text-right', s.evPerUnit.value > 0 ? 'text-positive' : 'text-negative')}>
                        {s.evPerUnit.formatted}
                      </td>
                      <td className="py-2 text-right text-muted">{s.kellyFraction.formatted}</td>
                      <td className="py-2 text-right">
                        <Chip
                          tone={
                            s.tier === 'strong'
                              ? 'positive'
                              : s.tier === 'moderate'
                                ? 'ai'
                                : s.tier === 'marginal'
                                  ? 'warn'
                                  : s.tier === 'negative'
                                    ? 'negative'
                                    : 'neutral'
                          }
                        >
                          {s.tier}
                        </Chip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-[11px] text-faint">
                Kelly fractions are capped at ¼ and are presented for sizing context only — this
                platform never places a stake.
              </p>
            </Panel>
          </section>

          {/* --------------------------------------- 06 risk & correlation */}
          <section id="risk" className="scroll-mt-40">
            <SectionHeading
              index="06"
              title="Risk & correlation"
              subtitle="Deterministic risk decomposition and portfolio entanglement, with the AI reading of each."
              icon={<ShieldAlert size={17} className="text-warn" aria-hidden />}
            />
            <div className="grid gap-4 lg:grid-cols-3">
              <RiskCard analysis={analysis} />
              <CorrelationCard analysis={analysis} />
              <DataQualityCard analysis={analysis} />
            </div>
          </section>

          {/* ------------------------------------------- 07 AI reasoning */}
          <section id="reasoning" className="scroll-mt-40">
            <SectionHeading
              index="07"
              title="AI reasoning & context"
              subtitle="Interpretation layer. Every figure quoted here was minted by a deterministic service."
              icon={<Brain size={17} className="text-ai" aria-hidden />}
              action={<OriginTag origin="ai-inference" />}
            />
            <div className="space-y-4">
              <AISummaryBlock analysis={analysis} nowTick={nowTick} />
              <div className="grid gap-4 lg:grid-cols-3">
                <KeyFactorsCard analysis={analysis} />
                <PositiveSignalsCard analysis={analysis} />
                <NegativeSignalsCard analysis={analysis} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <WarningsCard analysis={analysis} />
                <AssumptionsCard analysis={analysis} />
              </div>
            </div>
          </section>

          {/* ------------------------------------ 08 recommended actions */}
          <section id="actions" className="scroll-mt-40">
            <SectionHeading
              index="08"
              title="Recommended actions"
              subtitle="Mission seeds proposed by the intelligence layer. None of them move money."
              icon={<ListChecks size={17} className="text-ai" aria-hidden />}
              action={<OriginTag origin="ai-inference" />}
            />
            <div className="grid gap-3 md:grid-cols-2">
              {analysis.recommendedActions.map((a) => (
                <Panel key={a.id} tone="ai" className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Chip tone={a.priority === 'high' ? 'negative' : a.priority === 'medium' ? 'warn' : 'neutral'}>
                      {a.priority} priority
                    </Chip>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
                      {a.kind.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-foreground">{a.title}</h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">{a.detail}</p>
                  {a.trigger ? (
                    <p className="mt-2 rounded-md bg-surface-2 px-2.5 py-1.5 font-mono text-[10px] text-market">
                      trigger: {a.trigger.metric} {a.trigger.comparator === 'gte' ? '≥' : '≤'}{' '}
                      {a.trigger.threshold.formatted}
                    </p>
                  ) : null}
                  {a.missionEligible ? (
                    <a href="#mission" className="mt-3 inline-flex items-center gap-1 text-[11px] text-mission hover:underline">
                      <Rocket size={11} aria-hidden />
                      Build a mission from this
                    </a>
                  ) : null}
                </Panel>
              ))}
            </div>
          </section>

          {/* -------------------------------------------- 09 mission creation */}
          <section id="mission" className="scroll-mt-40">
            <SectionHeading
              index="09"
              title="Mission creation"
              subtitle="Convert a recommendation into a governed, observation-only mission."
              icon={<Rocket size={17} className="text-mission" aria-hidden />}
            />
            <div className="space-y-4">
              <MissionBuilder analysis={analysis} />
              {eventMissions.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {eventMissions.map((m) => (
                    <MissionCard key={m.id} mission={m} nowTick={nowTick} />
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        </>
      ) : job?.status === 'loading' ? (
        <Panel className="p-6">
          <LoadingState label="Intelligence engine is composing the analysis…" rows={4} />
        </Panel>
      ) : job?.status === 'error' ? (
        <ErrorState
          title="Intelligence engine failed"
          detail={`${job.error}${job.retryable ? ' — this failure is retryable.' : ''}`}
          onRetry={() => void runAnalysis(eventId)}
          retryLabel="Retry analysis"
        />
      ) : (
        <EmptyState
          title="No analysis on record"
          detail="Run an intelligence pass to generate the AI contract for this event."
          icon={<Activity size={22} />}
          action={
            <Button icon={<Sparkles size={13} />} onClick={() => void runAnalysis(eventId)}>
              Run analysis
            </Button>
          }
        />
      )}

      <p className="text-[11px] text-faint">
        Risk score {risk.score.formatted} · quality grade {quality.grade} · {snapshots.length} snapshots
        in scope.
      </p>
    </div>
  );
}
