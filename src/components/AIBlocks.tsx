import { memo } from 'react';
import {
  AlertTriangle,
  Brain,
  GitBranch,
  Gauge,
  ListChecks,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Waves,
} from 'lucide-react';
import type { AnalysisResponse } from '../ai/contracts';
import { Chip, Meter, OriginTag, Panel, ServiceTag, Stat } from './ui';
import { OddsMovementChart } from './OddsMovementChart';
import { cx, relativeTime } from '../lib/format';

const STANCE_TONE = {
  constructive: 'positive',
  neutral: 'ai',
  cautious: 'warn',
  avoid: 'negative',
} as const;

const RISK_TONE = {
  LOW: 'positive',
  MODERATE: 'ai',
  ELEVATED: 'warn',
  HIGH: 'negative',
} as const;

const TIER_TONE = {
  strong: 'positive',
  moderate: 'ai',
  marginal: 'warn',
  none: 'neutral',
  negative: 'negative',
} as const;

function GradeBadge({ grade }: { grade: 'A' | 'B' | 'C' | 'D' }) {
  const tone = grade === 'A' ? 'positive' : grade === 'B' ? 'ai' : grade === 'C' ? 'warn' : 'negative';
  return <Chip tone={tone}>Feed grade {grade}</Chip>;
}

/* =============================================================== AI blocks
 * Each block is exported so pages can compose their own section layout while
 * keeping a single implementation of the AI / market visual language.
 * ======================================================================== */

export const AISummaryBlock = memo(function AISummaryBlock({
  analysis,
  nowTick,
}: {
  analysis: AnalysisResponse;
  nowTick: number;
}) {
  return (
    <Panel tone="ai" className="rise overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ai/20 px-5 py-4">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <OriginTag origin="ai-inference" label="AI conclusion" />
            <Chip tone={STANCE_TONE[analysis.summary.stance]}>
              Stance: {analysis.summary.stance}
            </Chip>
            <span className="font-mono text-[10px] text-faint">
              {analysis.analysisId} · {relativeTime(analysis.generatedAt, nowTick)}
            </span>
          </div>
          <h3 className="flex items-start gap-2 text-base font-semibold leading-snug text-foreground">
            <Brain size={17} className="mt-0.5 shrink-0 text-ai" aria-hidden />
            {analysis.summary.headline}
          </h3>
        </div>
        <div className="w-44 shrink-0">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] uppercase tracking-[0.12em] text-faint">Confidence</span>
            <span className="font-mono text-sm font-semibold text-ai">
              {(analysis.confidence.score.value * 100).toFixed(0)}%
            </span>
          </div>
          <Meter
            value={analysis.confidence.score.value}
            ariaLabel={`AI confidence ${(analysis.confidence.score.value * 100).toFixed(0)} percent`}
          />
          <p className="mt-1 text-right font-mono text-[10px] uppercase tracking-wider text-faint">
            band: {analysis.confidence.band}
          </p>
        </div>
      </div>

      <div className="space-y-3 px-5 py-4">
        {analysis.summary.narrative.map((p, i) => (
          <p key={i} className="text-sm leading-relaxed text-foreground/90">
            {p}
          </p>
        ))}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[11px] text-faint">Grounded in:</span>
          {analysis.summary.groundedIn.map((s) => (
            <ServiceTag key={s} serviceId={s} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border-t border-ai/20 bg-ai/10 sm:grid-cols-4">
        {analysis.confidence.drivers.map((d) => (
          <div key={d.label} className="bg-surface px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.1em] text-faint">{d.label}</div>
            <div
              className={cx(
                'mt-1 flex items-center gap-1 font-mono text-sm',
                d.impact === 'increases' ? 'text-positive' : 'text-negative',
              )}
            >
              {d.impact === 'increases' ? (
                <TrendingUp size={12} aria-hidden />
              ) : (
                <TrendingDown size={12} aria-hidden />
              )}
              {d.magnitude.formatted}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
});


export const DataQualityCard = memo(function DataQualityCard({
  analysis,
}: {
  analysis: AnalysisResponse;
}) {
  return (
    <Panel className="p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          <Gauge size={15} className="text-market" aria-hidden />
          Data quality
        </h4>
        <GradeBadge grade={analysis.dataQuality.grade} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Score"
          tone="market"
          value={`${(analysis.dataQuality.score.value * 100).toFixed(0)}`}
          hint="0–100 composite"
        />
        <Stat
          label="Freshness"
          tone="market"
          value={analysis.dataQuality.freshnessMinutes.formatted}
          hint="since latest capture"
        />
        <Stat
          label="Coverage"
          tone="market"
          value={`${(analysis.dataQuality.bookmakerCoverage.value * 100).toFixed(0)}%`}
          hint="of tracked books"
        />
        <Stat
          label="Completeness"
          tone="market"
          value={`${(analysis.dataQuality.completeness.value * 100).toFixed(0)}%`}
          hint={`dispersion ${(analysis.dataQuality.dispersion.value * 100).toFixed(1)}%`}
        />
      </div>
      <div className="mt-3 rounded-lg bg-ai/[0.07] px-3 py-2 ring-1 ring-ai/25">
        <OriginTag origin="ai-inference" label="AI reading" />
        <p className="mt-1.5 text-xs leading-relaxed text-foreground/85">
          {analysis.dataQuality.interpretation}
        </p>
      </div>
      {analysis.dataQuality.issues.length ? (
        <ul className="mt-3 space-y-1.5">
          {analysis.dataQuality.issues.slice(0, 4).map((i, idx) => (
            <li key={idx} className="flex gap-2 text-[11px] text-muted">
              <span
                className={cx(
                  'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                  i.severity === 'error'
                    ? 'bg-negative'
                    : i.severity === 'warning'
                      ? 'bg-warn'
                      : 'bg-neutral',
                )}
              />
              {i.message}
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
});


export const RiskCard = memo(function RiskCard({
  analysis,
}: {
  analysis: AnalysisResponse;
}) {
  return (
    <Panel className="p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          <ShieldAlert size={15} className="text-warn" aria-hidden />
          Risk
        </h4>
        <Chip tone={RISK_TONE[analysis.riskAssessment.level]}>
          {analysis.riskAssessment.level}
        </Chip>
      </div>
      <div className="flex items-end justify-between">
        <Stat
          label="Risk score"
          value={`${(analysis.riskAssessment.score.value * 100).toFixed(0)}`}
          hint={`exposure ceiling ${analysis.riskAssessment.exposureCeilingPct.value.toFixed(1)}% of unit`}
        />
        <Stat
          label="To start"
          value={analysis.riskAssessment.timeToStartMinutes.formatted}
          hint="minutes"
        />
      </div>
      <div className="mt-3">
        <Meter
          value={analysis.riskAssessment.score.value}
          tone={analysis.riskAssessment.score.value > 0.5 ? 'negative' : 'warn'}
          ariaLabel="Risk score"
        />
      </div>
      <ul className="mt-3 space-y-2">
        {analysis.riskAssessment.factors.slice(0, 4).map((f) => (
          <li key={f.id}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted">{f.label}</span>
              <span className="font-mono text-faint">
                w{f.weight.value.toFixed(2)} · {(f.score.value * 100).toFixed(0)}
              </span>
            </div>
            <Meter value={f.score.value} tone="warn" ariaLabel={f.label} />
          </li>
        ))}
      </ul>
      <div className="mt-3 rounded-lg bg-ai/[0.07] px-3 py-2 ring-1 ring-ai/25">
        <OriginTag origin="ai-inference" label="AI reading" />
        <p className="mt-1.5 text-xs leading-relaxed text-foreground/85">
          {analysis.riskAssessment.interpretation}
        </p>
      </div>
    </Panel>
  );
});


export const CorrelationCard = memo(function CorrelationCard({
  analysis,
}: {
  analysis: AnalysisResponse;
}) {
  return (
    <Panel className="p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          <GitBranch size={15} className="text-mission" aria-hidden />
          Correlation
        </h4>
        <Chip tone={analysis.correlationAssessment.level === 'ISOLATED' ? 'positive' : 'mission'}>
          {analysis.correlationAssessment.level}
        </Chip>
      </div>
      <div className="flex items-end justify-between">
        <Stat
          label="Cluster score"
          value={`${(analysis.correlationAssessment.score.value * 100).toFixed(0)}`}
        />
        <Stat
          label="Independent"
          value={analysis.correlationAssessment.independentExposureCount.formatted}
          hint="other exposures"
        />
      </div>
      <div className="mt-3">
        <Meter
          value={analysis.correlationAssessment.score.value}
          tone="mission"
          ariaLabel="Correlation score"
        />
      </div>
      {analysis.correlationAssessment.clusters.length ? (
        <ul className="mt-3 space-y-1.5">
          {analysis.correlationAssessment.clusters.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-2 text-[11px]">
              <span className="text-muted">{c.label}</span>
              <span className="font-mono text-mission">{c.strength.formatted}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[11px] text-faint">No overlapping exposure detected.</p>
      )}
      <div className="mt-3 rounded-lg bg-ai/[0.07] px-3 py-2 ring-1 ring-ai/25">
        <OriginTag origin="ai-inference" label="AI reading" />
        <p className="mt-1.5 text-xs leading-relaxed text-foreground/85">
          {analysis.correlationAssessment.interpretation}
        </p>
      </div>
    </Panel>
  );
});


export const MarketMovementCard = memo(function MarketMovementCard({
  analysis,
}: {
  analysis: AnalysisResponse;
}) {
  return (
    <Panel tone="market" className="p-5 lg:col-span-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-market">
          <Waves size={15} aria-hidden />
          Market movement
        </h4>
        <OriginTag origin="deterministic" label="raw market data" />
      </div>
      <OddsMovementChart
        series={analysis.marketObservations.map((o) => ({
          selectionId: o.selectionId,
          label: o.label,
          points: o.series,
          direction: o.direction,
        }))}
      />
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-left">
          <caption className="sr-only">Odds movement per selection</caption>
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.12em] text-faint">
              <th scope="col" className="py-1 font-medium">Selection</th>
              <th scope="col" className="py-1 text-right font-medium">Open</th>
              <th scope="col" className="py-1 text-right font-medium">Now</th>
              <th scope="col" className="py-1 text-right font-medium">Δ</th>
              <th scope="col" className="py-1 text-right font-medium">Books</th>
            </tr>
          </thead>
          <tbody className="font-mono text-xs">
            {analysis.marketObservations.map((o) => (
              <tr key={o.selectionId} className="border-t border-line-soft">
                <td className="py-1.5 pr-2 font-sans text-foreground">
                  {o.label}
                  {o.steam ? <Chip tone="negative" className="ml-2">steam</Chip> : null}
                </td>
                <td className="py-1.5 text-right text-muted">{o.openingPrice.formatted}</td>
                <td className="py-1.5 text-right text-market">{o.currentPrice.formatted}</td>
                <td
                  className={cx(
                    'py-1.5 text-right',
                    o.changePct.value < 0 ? 'text-positive' : o.changePct.value > 0 ? 'text-negative' : 'text-muted',
                  )}
                >
                  {o.changePct.formatted}
                </td>
                <td className="py-1.5 text-right text-faint">{o.bookCount.formatted}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
});


export const ModelVsMarketCard = memo(function ModelVsMarketCard({
  analysis,
}: {
  analysis: AnalysisResponse;
}) {
  const topValue = [...analysis.valueSignals].sort(
    (a, b) => b.qualityAdjustedEdgePct.value - a.qualityAdjustedEdgePct.value,
  )[0];
  const topEstimate =
    analysis.probabilityEstimates.find((p) => p.selectionId === topValue?.selectionId) ??
    analysis.probabilityEstimates[0];
  return (
    <Panel className="p-5 lg:col-span-2">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles size={15} className="text-ai" aria-hidden />
          Model vs market
        </h4>
        <span className="font-mono text-[10px] text-faint">
          {analysis.probabilityEstimates[0]?.modelVersion}
        </span>
      </div>
      <ul className="space-y-3">
        {analysis.probabilityEstimates.map((p) => {
          const value = analysis.valueSignals.find((v) => v.selectionId === p.selectionId);
          return (
            <li key={p.selectionId} className="rounded-lg border border-line bg-surface-2 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-foreground">{p.label}</span>
                {value ? <Chip tone={TIER_TONE[value.tier]}>{value.tier}</Chip> : null}
              </div>
              <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-faint">Model</div>
                  <div className="text-ai">{p.modelProbability.formatted}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-faint">Implied</div>
                  <div className="text-market">{p.impliedProbability.formatted}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-faint">Edge</div>
                  <div
                    className={cx(
                      p.divergencePct.value > 0 ? 'text-positive' : 'text-negative',
                    )}
                  >
                    {p.divergencePct.formatted}
                  </div>
                </div>
              </div>
              <div className="mt-2 flex gap-1">
                <div className="flex-1">
                  <Meter value={p.modelProbability.value} tone="ai" ariaLabel={`${p.label} model probability`} />
                </div>
                <div className="flex-1">
                  <Meter
                    value={p.impliedProbability.value}
                    tone="warn"
                    ariaLabel={`${p.label} implied probability`}
                  />
                </div>
              </div>
              {value ? (
                <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-foreground/80">
                  <Sparkles size={11} className="mt-0.5 shrink-0 text-ai" aria-hidden />
                  {value.commentary}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {topValue && topEstimate ? (
        <div className="mt-3 grid grid-cols-3 gap-3 rounded-lg bg-surface-2 px-3 py-3 ring-1 ring-line">
          <Stat label="Best price" tone="market" value={topValue.bestPrice.formatted} hint={topValue.bestBookmaker ?? '—'} />
          <Stat label="EV / unit" tone={topValue.evPerUnit.value > 0 ? 'positive' : 'negative'} value={topValue.evPerUnit.formatted} />
          <Stat label="Kelly" value={topValue.kellyFraction.formatted} hint="capped ¼" />
        </div>
      ) : null}
    </Panel>
  );
});


export const KeyFactorsCard = memo(function KeyFactorsCard({
  analysis,
}: {
  analysis: AnalysisResponse;
}) {
  return (
    <Panel className="p-5">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <ListChecks size={15} className="text-ai" aria-hidden />
        Key factors
      </h4>
      <ul className="space-y-3">
        {analysis.keyFactors.map((f) => (
          <li key={f.id}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-medium text-foreground">
                <span
                  className={cx(
                    'h-1.5 w-1.5 rounded-full',
                    f.polarity === 'supportive'
                      ? 'bg-positive'
                      : f.polarity === 'adverse'
                        ? 'bg-negative'
                        : 'bg-neutral',
                  )}
                  aria-hidden
                />
                {f.label}
              </span>
              <OriginTag origin={f.origin} label={f.origin === 'ai-inference' ? 'AI' : 'data'} />
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">{f.detail}</p>
            <div className="mt-1.5">
              <Meter
                value={f.weight.value}
                tone={f.polarity === 'adverse' ? 'negative' : 'ai'}
                ariaLabel={`${f.label} weight`}
              />
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
});


export const PositiveSignalsCard = memo(function PositiveSignalsCard({
  analysis,
}: {
  analysis: AnalysisResponse;
}) {
  return (
    <Panel className="p-5">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-positive">
        <TrendingUp size={15} aria-hidden />
        Positive signals
      </h4>
      {analysis.positiveSignals.length ? (
        <ul className="space-y-3">
          {analysis.positiveSignals.map((s) => (
            <li key={s.id} className="rounded-lg border border-positive/25 bg-positive/[0.05] p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-medium text-foreground">{s.label}</span>
                <OriginTag origin={s.origin} label={s.origin === 'ai-inference' ? 'AI' : 'data'} />
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">{s.detail}</p>
              <p className="mt-1 font-mono text-[10px] text-positive">
                strength {s.strength.formatted}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-faint">No supportive signals identified.</p>
      )}
    </Panel>
  );
});


export const NegativeSignalsCard = memo(function NegativeSignalsCard({
  analysis,
}: {
  analysis: AnalysisResponse;
}) {
  return (
    <Panel className="p-5">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-negative">
        <TrendingDown size={15} aria-hidden />
        Negative signals
      </h4>
      {analysis.negativeSignals.length ? (
        <ul className="space-y-3">
          {analysis.negativeSignals.map((s) => (
            <li key={s.id} className="rounded-lg border border-negative/25 bg-negative/[0.05] p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-medium text-foreground">{s.label}</span>
                <OriginTag origin={s.origin} label={s.origin === 'ai-inference' ? 'AI' : 'data'} />
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">{s.detail}</p>
              <p className="mt-1 font-mono text-[10px] text-negative">
                strength {s.strength.formatted}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-faint">No adverse signals identified.</p>
      )}
    </Panel>
  );
});


export const WarningsCard = memo(function WarningsCard({
  analysis,
}: {
  analysis: AnalysisResponse;
}) {
  return (
    <Panel className="p-5">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-warn">
        <AlertTriangle size={15} aria-hidden />
        Warnings
      </h4>
      <ul className="space-y-2">
        {analysis.warnings.map((w) => (
          <li
            key={w.id}
            className={cx(
              'flex items-start gap-2 rounded-lg px-3 py-2 text-[11px] leading-relaxed',
              w.severity === 'critical'
                ? 'bg-negative/[0.08] text-negative ring-1 ring-negative/30'
                : w.severity === 'warning'
                  ? 'bg-warn/[0.08] text-warn ring-1 ring-warn/25'
                  : 'bg-surface-2 text-muted ring-1 ring-line',
            )}
          >
            <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden />
            <span className="flex-1">{w.message}</span>
            <OriginTag origin={w.origin} label={w.origin === 'ai-inference' ? 'AI' : 'data'} />
          </li>
        ))}
      </ul>
    </Panel>
  );
});


export const AssumptionsCard = memo(function AssumptionsCard({
  analysis,
}: {
  analysis: AnalysisResponse;
}) {
  return (
    <Panel className="p-5">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Brain size={15} className="text-ai" aria-hidden />
        Assumptions
        <OriginTag origin="ai-inference" className="ml-1" />
      </h4>
      <ul className="space-y-2">
        {analysis.assumptions.map((a) => (
          <li key={a.id} className="rounded-lg border border-ai/20 bg-ai/[0.05] px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] leading-relaxed text-foreground/85">{a.statement}</p>
              <span className="shrink-0 font-mono text-[10px] text-ai">
                {a.confidence.formatted}
              </span>
            </div>
            <span className="mt-1 inline-block font-mono text-[9px] uppercase tracking-wider text-faint">
              basis: {a.basis}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
});


/**
 * Premium intelligence panel — full composition of every AI block.
 * Cyan/solid = AI conclusion. Amber/dashed/monospace = raw market measurement.
 */
export const AIIntelligencePanel = memo(function AIIntelligencePanel({
  analysis,
  nowTick,
  dense = false,
}: {
  analysis: AnalysisResponse;
  nowTick: number;
  dense?: boolean;
}) {
  return (
    <div className="space-y-4">
      <AISummaryBlock analysis={analysis} nowTick={nowTick} />
      <div className={cx('grid gap-4', dense ? 'lg:grid-cols-2' : 'lg:grid-cols-3')}>
        <DataQualityCard analysis={analysis} />
        <RiskCard analysis={analysis} />
        <CorrelationCard analysis={analysis} />
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <MarketMovementCard analysis={analysis} />
        </div>
        <div className="lg:col-span-2">
          <ModelVsMarketCard analysis={analysis} />
        </div>
      </div>
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
  );
});
