import type { SportsDataRepository } from '../domain/repositories';
import type { MarketKey, NormalizationIssue, OddsSnapshot, SportEvent } from '../domain/types';
import { det } from '../domain/numbers';
import { MARKET_LABELS, SPORT_LABELS, BOOKMAKERS } from '../domain/feed/normalization';
import { computeMarketMovement, primaryMarketFor } from '../domain/services/movementService';
import { assessDataQuality } from '../domain/services/dataQualityService';
import { computeModelProbabilities } from '../domain/services/probabilityService';
import { computeValue } from '../domain/services/valueService';
import {
  computeCorrelation,
  computeRisk,
  type CorrelationContextEntry,
} from '../domain/services/riskService';
import { ANALYSIS_CONTRACT_VERSION } from './contracts';
import type {
  AnalysisRequest,
  AnalysisResponse,
  AnalysisStance,
  Assumption,
  ConfidenceBand,
  KeyFactor,
  MarketObservation,
  ProbabilityEstimate,
  RecommendedAction,
  Signal,
  ValueSignal,
  AnalysisWarning,
} from './contracts';
import { AnalysisError, type AIAnalysisService } from './AIAnalysisService';
import { validateAnalysisResponse } from './validation';

const AI_SERVICE_ID = 'value-service' as const;

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function bandFor(score: number): ConfidenceBand {
  if (score >= 0.82) return 'very-high';
  if (score >= 0.66) return 'high';
  if (score >= 0.48) return 'medium';
  if (score >= 0.3) return 'low';
  return 'very-low';
}

function analysisId(eventId: string, market: string, at: Date): string {
  const stamp = at.toISOString().replace(/[-:.TZ]/g, '').slice(2, 14);
  return `ANL-${eventId.replace('EVT-', '')}-${market.toUpperCase().slice(0, 4)}-${stamp}`;
}

export interface MockAIAnalysisOptions {
  latencyMs?: number;
  correlationContext?: () => CorrelationContextEntry[];
  failNext?: () => boolean;
  now?: () => Date;
}

export class MockAIAnalysisService implements AIAnalysisService {
  readonly engineId = 'badbuilder-mock-intelligence';
  readonly mode = 'mock' as const;

  constructor(
    private readonly repo: SportsDataRepository,
    private readonly options: MockAIAnalysisOptions = {},
  ) {}

  async health() {
    const latency = this.options.latencyMs ?? 380;
    await delay(90);
    return {
      ok: true,
      engineId: this.engineId,
      latencyMs: latency,
      detail: 'Mock intelligence engine online — deterministic services wired, no external AI API.',
    };
  }

  async analyzeEvent(request: AnalysisRequest): Promise<AnalysisResponse> {
    const started = Date.now();
    const latency = (this.options.latencyMs ?? 380) * (request.depth === 'deep' ? 2 : 1);
    await delay(latency);

    if (this.options.failNext?.()) {
      throw new AnalysisError({
        code: 'ENGINE_UNAVAILABLE',
        message: 'Intelligence engine refused the request (simulated transport failure).',
        retryable: true,
      });
    }

    const event = await this.repo.getEvent(request.eventId);
    if (!event) {
      throw new AnalysisError({
        code: 'EVENT_NOT_FOUND',
        message: `No canonical event found for id ${request.eventId}`,
        retryable: false,
      });
    }

    const dataset = await this.repo.loadCanonicalDataset();
    const snapshots = dataset.snapshots.filter((s) => s.eventId === event.id);
    const market: MarketKey | null = request.market ?? primaryMarketFor(event.id, snapshots);
    if (!market || !snapshots.length) {
      throw new AnalysisError({
        code: 'NO_MARKET_DATA',
        message: `No odds snapshots available for ${event.id}`,
        retryable: true,
      });
    }

    const now = this.options.now?.() ?? new Date();
    const response = this.compose(event, market, snapshots, dataset.issues, now, started);

    const validation = validateAnalysisResponse(response);
    if (!validation.valid) {
      throw new AnalysisError({
        code: 'CONTRACT_INVALID',
        message: 'Analysis failed contract validation and was rejected.',
        retryable: false,
        validation,
      });
    }
    return response;
  }

  private compose(
    event: SportEvent,
    market: MarketKey,
    snapshots: OddsSnapshot[],
    normalizationIssues: readonly NormalizationIssue[],
    now: Date,
    started: number,
  ): AnalysisResponse {
    const movement = computeMarketMovement(event.id, market, snapshots);
    const quality = assessDataQuality(event.id, market, snapshots, normalizationIssues, now);
    const selectionIds = movement ? movement.selections.map((s) => s.selectionId) : [];
    const model = computeModelProbabilities(event, market, selectionIds, now);
    const value = computeValue(event.id, market, snapshots, model, quality, now);
    const risk = computeRisk(event, movement, quality, value, now);
    const correlation = computeCorrelation(
      event,
      market,
      this.options.correlationContext?.() ?? [],
      now,
    );

    const eventLabel = `${event.homeTeam.name} vs ${event.awayTeam.name}`;
    const topValue = [...value.signals].sort(
      (a, b) => b.qualityAdjustedEdgePct.value - a.qualityAdjustedEdgePct.value,
    )[0];
    const sharpestMove = movement
      ? [...movement.selections].sort(
          (a, b) => Math.abs(b.changePct.value) - Math.abs(a.changePct.value),
        )[0]
      : null;

    const confidenceScore =
      quality.score.value * 0.45 +
      (1 - risk.score.value) * 0.3 +
      (movement && movement.snapshotCount.value >= 8 ? 0.15 : 0.07) +
      (correlation.level === 'ISOLATED' ? 0.1 : 0.04);
    const confidence = Math.max(0, Math.min(1, confidenceScore));

    const stance: AnalysisStance =
      quality.grade === 'D' || risk.level === 'HIGH'
        ? 'avoid'
        : topValue && topValue.tier === 'strong' && quality.score.value > 0.7
          ? 'constructive'
          : topValue && (topValue.tier === 'moderate' || topValue.tier === 'marginal')
            ? 'neutral'
            : 'cautious';

    const marketObservations: MarketObservation[] = (movement?.selections ?? []).map((s) => ({
      id: `obs-${s.selectionId}`,
      selectionId: s.selectionId,
      label: s.label,
      openingPrice: s.openingPrice,
      currentPrice: s.currentPrice,
      changePct: s.changePct,
      volatility: s.volatility,
      direction: s.direction,
      steam: s.steam,
      lastMoveAt: s.lastMoveAt,
      bookCount: det(
        s.series.length ? s.series[s.series.length - 1].books : 0,
        'count',
        'movement-service',
      ),
      series: s.series,
      note:
        s.direction === 'shortening'
          ? `Price compressed from ${s.openingPrice.formatted} to ${s.currentPrice.formatted} — money is arriving on this side.`
          : s.direction === 'drifting'
            ? `Price eased from ${s.openingPrice.formatted} to ${s.currentPrice.formatted} — the book is pushing risk away.`
            : `Held inside ±1.5% since open (${s.openingPrice.formatted} → ${s.currentPrice.formatted}).`,
      origin: 'deterministic',
    }));

    const probabilityEstimates: ProbabilityEstimate[] = model.probabilities.map((p) => {
      const v = value.signals.find((s) => s.selectionId === p.selectionId);
      return {
        selectionId: p.selectionId,
        label: p.label,
        modelProbability: p.probability,
        impliedProbability: v?.impliedProbability ?? det(0, 'probability', 'value-service'),
        fairProbability: v?.fairProbability ?? det(0, 'probability', 'value-service'),
        modelFairOdds: p.fairOdds,
        divergencePct: v?.edgePct ?? det(0, 'percent', 'value-service'),
        modelVersion: model.modelVersion,
        drivers: p.drivers,
        origin: 'deterministic',
      };
    });

    const bookmakerName = (id: string | null | undefined): string | null =>
      id ? BOOKMAKERS[id]?.name ?? id : null;

    const valueSignals: ValueSignal[] = value.signals.map((s) => ({
      selectionId: s.selectionId,
      label: s.label,
      bestBookmaker: bookmakerName(s.bestBookmaker),
      bestPrice: s.bestPrice,
      consensusPrice: s.consensusPrice,
      edgePct: s.edgePct,
      qualityAdjustedEdgePct: s.qualityAdjustedEdgePct,
      evPerUnit: s.evPerUnit,
      kellyFraction: s.kellyFraction,
      tier: s.tier,
      commentary:
        s.tier === 'strong'
          ? `Model sits ${s.edgePct.formatted} above the best available price; edge survives the data-quality haircut at ${s.qualityAdjustedEdgePct.formatted}.`
          : s.tier === 'moderate'
            ? `Playable divergence of ${s.edgePct.formatted}, but it thins to ${s.qualityAdjustedEdgePct.formatted} once feed quality is applied.`
            : s.tier === 'marginal'
              ? `Edge is inside noise tolerance (${s.edgePct.formatted}); treat as a watch item, not a conclusion.`
              : s.tier === 'negative'
                ? `Market is ahead of the model by ${s.edgePct.formatted} — no constructive read here.`
                : 'No measurable divergence between model and market.',
      origin: 'ai-inference',
    }));

    const keyFactors: KeyFactor[] = [
      {
        id: 'kf-rating',
        label: 'Rating & form differential',
        detail: `${event.homeTeam.shortName} (${event.homeTeam.rating}) vs ${event.awayTeam.shortName} (${event.awayTeam.rating}); form ${event.homeTeam.form.join('')} vs ${event.awayTeam.form.join('')}.`,
        weight: det(0.28, 'ratio', 'probability-service'),
        polarity: event.homeTeam.rating >= event.awayTeam.rating ? 'supportive' : 'adverse',
        origin: 'deterministic',
      },
      {
        id: 'kf-movement',
        label: 'Directional market pressure',
        detail: sharpestMove
          ? `${sharpestMove.label} moved ${sharpestMove.changePct.formatted} since open across ${movement?.bookmakersTracked.length ?? 0} books.`
          : 'No movement history captured for this market.',
        weight: det(0.24, 'ratio', 'movement-service'),
        polarity: movement?.steamDetected ? 'adverse' : 'neutral',
        origin: 'ai-inference',
      },
      {
        id: 'kf-quality',
        label: 'Feed integrity',
        detail: `Grade ${quality.grade}; latest capture ${quality.freshnessMinutes.formatted} old with ${(quality.bookmakerCoverage.value * 100).toFixed(0)}% book coverage.`,
        weight: det(0.22, 'ratio', 'data-quality-service'),
        polarity: quality.grade === 'A' || quality.grade === 'B' ? 'supportive' : 'adverse',
        origin: 'deterministic',
      },
      {
        id: 'kf-liquidity',
        label: 'Liquidity & availability',
        detail: `Liquidity index ${(event.liquidity * 100).toFixed(0)}%, ${event.homeTeam.injuriesOut + event.awayTeam.injuriesOut} players unavailable.`,
        weight: det(0.14, 'ratio', 'risk-service'),
        polarity: event.liquidity > 0.8 ? 'supportive' : 'adverse',
        origin: 'deterministic',
      },
      {
        id: 'kf-correlation',
        label: 'Portfolio correlation',
        detail: correlation.clusters.length
          ? correlation.clusters.map((c) => c.label).join('; ')
          : 'No overlapping exposure detected in the active book.',
        weight: det(0.12, 'ratio', 'correlation-service'),
        polarity: correlation.level === 'ISOLATED' ? 'supportive' : 'adverse',
        origin: 'ai-inference',
      },
    ];

    const positiveSignals: Signal[] = [];
    const negativeSignals: Signal[] = [];

    if (topValue && topValue.edgePct.value > 1) {
      positiveSignals.push({
        id: 'ps-edge',
        label: `Model edge on ${topValue.label}`,
        detail: `Best price ${topValue.bestPrice.formatted} at ${bookmakerName(topValue.bestBookmaker) ?? 'n/a'} against model fair odds.`,
        strength: topValue.qualityAdjustedEdgePct,
        origin: 'ai-inference',
      });
    }
    if (quality.grade === 'A' || quality.grade === 'B') {
      positiveSignals.push({
        id: 'ps-quality',
        label: 'Clean, multi-book input set',
        detail: `${movement?.snapshotCount.formatted ?? '0'} snapshots from ${movement?.bookmakersTracked.length ?? 0} books, dispersion ${(quality.dispersion.value * 100).toFixed(1)}%.`,
        strength: quality.score,
        origin: 'deterministic',
      });
    }
    if (movement && !movement.steamDetected && movement.maxAbsChangePct.value < 4) {
      positiveSignals.push({
        id: 'ps-stability',
        label: 'Stable pricing regime',
        detail: `Largest absolute move is ${movement.maxAbsChangePct.formatted}; no steam pattern detected.`,
        strength: det(1 - Math.min(1, movement.maxAbsChangePct.value / 10), 'ratio', 'movement-service'),
        origin: 'deterministic',
      });
    }
    if (correlation.level === 'ISOLATED' || correlation.level === 'LOW') {
      positiveSignals.push({
        id: 'ps-independence',
        label: 'Low portfolio entanglement',
        detail: `${correlation.independentExposureCount.formatted} independent exposures alongside this market.`,
        strength: det(1 - correlation.score.value, 'ratio', 'correlation-service'),
        origin: 'deterministic',
      });
    }

    if (quality.stale) {
      negativeSignals.push({
        id: 'ns-stale',
        label: 'Stale snapshot window',
        detail: `Latest capture is ${quality.freshnessMinutes.formatted} old; treat prices as indicative only.`,
        strength: det(Math.min(1, quality.freshnessMinutes.value / 90), 'ratio', 'data-quality-service'),
        origin: 'deterministic',
      });
    }
    if (movement?.steamDetected) {
      negativeSignals.push({
        id: 'ns-steam',
        label: 'Steam move detected',
        detail: 'Monotone drift beyond 6% suggests informed money has already moved this market.',
        strength: det(Math.min(1, movement.maxAbsChangePct.value / 12), 'ratio', 'movement-service'),
        origin: 'ai-inference',
      });
    }
    if (quality.partial) {
      negativeSignals.push({
        id: 'ns-partial',
        label: 'Partial market coverage',
        detail: `Completeness ${(quality.completeness.value * 100).toFixed(0)}% — some books are not quoting every selection.`,
        strength: det(1 - quality.completeness.value, 'ratio', 'data-quality-service'),
        origin: 'deterministic',
      });
    }
    if (risk.level === 'ELEVATED' || risk.level === 'HIGH') {
      negativeSignals.push({
        id: 'ns-risk',
        label: `${risk.level === 'HIGH' ? 'High' : 'Elevated'} risk profile`,
        detail: risk.factors
          .slice()
          .sort((a, b) => b.score.value * b.weight.value - a.score.value * a.weight.value)[0].note,
        strength: risk.score,
        origin: 'ai-inference',
      });
    }
    if (correlation.level === 'MODERATE' || correlation.level === 'HIGH') {
      negativeSignals.push({
        id: 'ns-correlation',
        label: 'Correlated exposure',
        detail: correlation.clusters.map((c) => c.label).join('; '),
        strength: correlation.score,
        origin: 'ai-inference',
      });
    }

    const warnings: AnalysisWarning[] = [
      ...quality.issues.map((i, idx) => ({
        id: `w-dq-${idx}`,
        severity: (i.severity === 'error' ? 'critical' : i.severity) as AnalysisWarning['severity'],
        message: i.message,
        origin: 'deterministic' as const,
      })),
    ];
    if (event.status === 'live') {
      warnings.push({
        id: 'w-live',
        severity: 'warning',
        message: 'Event is in play — pre-match model assumptions degrade quickly.',
        origin: 'ai-inference',
      });
    }
    if (topValue && topValue.tier === 'strong' && quality.grade !== 'A') {
      warnings.push({
        id: 'w-edge-quality',
        severity: 'warning',
        message: 'Strong edge is resting on a non-A grade feed; confirm with a fresh capture before acting.',
        origin: 'ai-inference',
      });
    }
    warnings.push({
      id: 'w-no-exec',
      severity: 'info',
      message: 'This analysis is informational. No stake, order or real-money action is produced by this system.',
      origin: 'ai-inference',
    });

    const assumptions: Assumption[] = [
      {
        id: 'as-model',
        statement: `Model ${model.modelVersion} treats rating, weighted form, home advantage and availability as the only pre-match inputs.`,
        basis: 'model',
        confidence: det(0.78, 'ratio', 'probability-service'),
        origin: 'ai-inference',
      },
      {
        id: 'as-devig',
        statement: 'Market fair probabilities are derived by proportional de-vigging of the reliability-weighted consensus price.',
        basis: 'market',
        confidence: det(0.72, 'ratio', 'value-service'),
        origin: 'ai-inference',
      },
      {
        id: 'as-snapshot',
        statement: `Snapshots are assumed representative of live prices within the ${quality.freshnessMinutes.formatted} freshness window.`,
        basis: 'data-pipeline',
        confidence: det(Math.max(0.2, quality.score.value), 'ratio', 'data-quality-service'),
        origin: 'ai-inference',
      },
      {
        id: 'as-ops',
        statement: 'Missions are monitoring instruments only; a human approval gate precedes any execution step.',
        basis: 'operational',
        confidence: det(1, 'ratio', 'risk-service'),
        origin: 'ai-inference',
      },
    ];

    const recommendedActions: RecommendedAction[] = [];
    const focus = topValue ?? value.signals[0];
    if (focus) {
      recommendedActions.push({
        id: 'ra-monitor',
        kind: 'MONITOR_MARKET',
        title: `Monitor ${MARKET_LABELS[market]} — ${focus.label}`,
        detail: `Track ${focus.label} at ${bookmakerName(focus.bestBookmaker) ?? 'best book'} and reassess if the price moves materially.`,
        priority: focus.tier === 'strong' ? 'high' : 'medium',
        missionEligible: true,
        trigger: {
          metric: 'odds-change-pct',
          comparator: 'gte',
          threshold: det(2.5, 'percent', 'movement-service'),
        },
        origin: 'ai-inference',
      });
      recommendedActions.push({
        id: 'ra-reassess',
        kind: 'REASSESS_ON_MOVEMENT',
        title: 'Re-run analysis after defined odds movement',
        detail: `Re-evaluate the model/market divergence once ${focus.label} moves ±3% or a fresher snapshot lands.`,
        priority: 'medium',
        missionEligible: true,
        trigger: {
          metric: 'odds-change-pct',
          comparator: 'gte',
          threshold: det(3, 'percent', 'movement-service'),
        },
        origin: 'ai-inference',
      });
    }
    if (quality.grade === 'C' || quality.grade === 'D' || quality.stale) {
      recommendedActions.push({
        id: 'ra-quality',
        kind: 'DATA_QUALITY_WATCH',
        title: 'Open a data-quality watch before trusting this market',
        detail: `Feed grade ${quality.grade}. Require a capture younger than 10 minutes from at least 3 books before promoting any conclusion.`,
        priority: 'high',
        missionEligible: true,
        trigger: {
          metric: 'data-quality-score',
          comparator: 'lte',
          threshold: det(0.6, 'ratio', 'data-quality-service'),
        },
        origin: 'ai-inference',
      });
    }
    if (focus && focus.tier !== 'none' && focus.tier !== 'negative') {
      recommendedActions.push({
        id: 'ra-confirm',
        kind: 'VALUE_CONFIRMATION',
        title: 'Confirm edge against an independent capture',
        detail: `Validate the ${focus.edgePct.formatted} divergence on ${focus.label} with a second, independent snapshot before escalating.`,
        priority: focus.tier === 'strong' ? 'high' : 'low',
        missionEligible: true,
        trigger: {
          metric: 'edge-pct',
          comparator: 'lte',
          threshold: det(1, 'percent', 'value-service'),
        },
        origin: 'ai-inference',
      });
    }
    if (correlation.level === 'MODERATE' || correlation.level === 'HIGH') {
      recommendedActions.push({
        id: 'ra-corr',
        kind: 'CORRELATION_GUARD',
        title: 'Guard correlated exposure',
        detail: `Cap combined exposure across ${correlation.clusters.map((c) => c.label).join('; ')}.`,
        priority: 'medium',
        missionEligible: true,
        origin: 'ai-inference',
      });
    }
    if (!recommendedActions.length) {
      recommendedActions.push({
        id: 'ra-none',
        kind: 'NO_ACTION',
        title: 'No action warranted',
        detail: 'Nothing in the current snapshot set justifies a mission.',
        priority: 'low',
        missionEligible: false,
        origin: 'ai-inference',
      });
    }

    const narrative: string[] = [
      `${eventLabel} (${event.league.name}) prices out as a ${stance === 'constructive' ? 'constructive' : stance === 'avoid' ? 'stand-aside' : stance} read on ${MARKET_LABELS[market]}. ` +
        (sharpestMove
          ? `The defining market event is ${sharpestMove.label} moving ${sharpestMove.changePct.formatted} from ${sharpestMove.openingPrice.formatted} to ${sharpestMove.currentPrice.formatted}.`
          : 'No meaningful price action has been captured yet.'),
      topValue
        ? `Against model ${model.modelVersion}, ${topValue.label} shows a ${topValue.edgePct.formatted} divergence versus the best available price of ${topValue.bestPrice.formatted}${topValue.bestBookmaker ? ` at ${bookmakerName(topValue.bestBookmaker) ?? topValue.bestBookmaker}` : ''}.`
        : 'No value signal could be constructed from the available prices.',
      `Risk is ${risk.level.toLowerCase()} (${(risk.score.value * 100).toFixed(0)}/100) and correlation is ${correlation.level.toLowerCase()}. ${risk.factors.slice().sort((a, b) => b.score.value * b.weight.value - a.score.value * a.weight.value)[0].note}.`,
      `Recommended posture: ${recommendedActions[0].title.toLowerCase()}. Every figure above is produced by the deterministic domain services (movement, data-quality, probability, value, risk, correlation); this layer supplies interpretation only.`,
    ];

    const sourceSnapshots = snapshots
      .filter((s) => s.market === market)
      .slice(-14)
      .reverse()
      .map((s) => ({
        snapshotId: s.id,
        bookmaker: bookmakerName(s.bookmaker) ?? s.bookmaker,
        market: s.market,
        capturedAt: s.capturedAt,
        quoteCount: det(s.quotes.length, 'count', 'odds-math'),
        feedLatencyMs: det(s.feedLatencyMs, 'count', 'odds-math'),
        provider: s.provider,
      }));

    const degradedReasons: string[] = [];
    if (quality.stale) degradedReasons.push('stale-snapshots');
    if (quality.partial) degradedReasons.push('partial-book-coverage');
    if ((movement?.snapshotCount.value ?? 0) < 6) degradedReasons.push('short-movement-history');

    return {
      analysisId: analysisId(event.id, market, now),
      eventId: event.id,
      generatedAt: now.toISOString(),
      summary: {
        headline:
          stance === 'constructive'
            ? `Constructive: retained edge on ${topValue?.label ?? MARKET_LABELS[market]}`
            : stance === 'avoid'
              ? `Stand aside: ${quality.grade === 'D' ? 'feed integrity' : 'risk profile'} fails the bar`
              : stance === 'cautious'
                ? 'Cautious: divergence present but not durable'
                : `Neutral: monitor ${MARKET_LABELS[market]} for a cleaner entry`,
        narrative,
        stance,
        origin: 'ai-inference',
        groundedIn: [
          'movement-service',
          'data-quality-service',
          'probability-service',
          'value-service',
          'risk-service',
          'correlation-service',
        ],
      },
      confidence: {
        score: det(confidence, 'ratio', AI_SERVICE_ID),
        band: bandFor(confidence),
        rationale: `Confidence is anchored on feed grade ${quality.grade}, ${movement?.snapshotCount.formatted ?? '0'} captured snapshots, ${risk.level.toLowerCase()} risk and ${correlation.level.toLowerCase()} correlation.`,
        origin: 'ai-inference',
        drivers: [
          { label: `Data quality (grade ${quality.grade})`, impact: quality.score.value >= 0.7 ? 'increases' : 'decreases', magnitude: quality.score },
          { label: `Risk score`, impact: risk.score.value <= 0.45 ? 'increases' : 'decreases', magnitude: risk.score },
          { label: 'Movement history depth', impact: (movement?.snapshotCount.value ?? 0) >= 8 ? 'increases' : 'decreases', magnitude: movement?.snapshotCount ?? det(0, 'count', 'movement-service') },
          { label: 'Correlation pressure', impact: correlation.score.value <= 0.3 ? 'increases' : 'decreases', magnitude: correlation.score },
        ],
      },
      dataQuality: {
        grade: quality.grade,
        score: quality.score,
        freshnessMinutes: quality.freshnessMinutes,
        bookmakerCoverage: quality.bookmakerCoverage,
        completeness: quality.completeness,
        dispersion: quality.dispersion,
        stale: quality.stale,
        partial: quality.partial,
        issues: quality.issues.map((i) => ({ severity: i.severity, message: i.message })),
        interpretation:
          quality.grade === 'A'
            ? 'Inputs are clean enough to support a firm conclusion.'
            : quality.grade === 'B'
              ? 'Inputs are usable; minor gaps do not invalidate the read.'
              : quality.grade === 'C'
                ? 'Inputs are degraded — conclusions should be treated as provisional.'
                : 'Inputs are unreliable; no conclusion should be promoted from this data.',
        origin: 'ai-inference',
      },
      keyFactors,
      positiveSignals,
      negativeSignals,
      marketObservations,
      probabilityEstimates,
      valueSignals,
      riskAssessment: {
        level: risk.level,
        score: risk.score,
        exposureCeilingPct: risk.exposureCeilingPct,
        timeToStartMinutes: risk.timeToStartMinutes,
        factors: risk.factors,
        interpretation:
          risk.level === 'LOW'
            ? 'Risk surface is benign; standard monitoring is sufficient.'
            : risk.level === 'MODERATE'
              ? 'Risk is manageable but the position should be re-checked closer to start.'
              : risk.level === 'ELEVATED'
                ? 'Risk is elevated — tighten thresholds and shorten the reassessment interval.'
                : 'Risk is hostile; monitoring only, no escalation.',
        origin: 'ai-inference',
      },
      correlationAssessment: {
        level: correlation.level,
        score: correlation.score,
        independentExposureCount: correlation.independentExposureCount,
        clusters: correlation.clusters.map((c) => ({
          id: c.id,
          label: c.label,
          reason: c.reason,
          strength: c.strength,
          relatedEventIds: c.relatedEventIds,
        })),
        interpretation:
          correlation.level === 'ISOLATED'
            ? 'This market is effectively independent of current exposure.'
            : correlation.level === 'LOW'
              ? 'Mild overlap with existing exposure; no structural concern.'
              : correlation.level === 'MODERATE'
                ? 'Overlapping drivers exist — size any combined exposure as one position.'
                : 'Heavily correlated with existing exposure; treat as a single concentrated risk.',
        origin: 'ai-inference',
      },
      recommendedActions,
      warnings,
      assumptions,
      sourceSnapshots,
      context: {
        eventLabel,
        leagueName: event.league.name,
        sportLabel: SPORT_LABELS[event.sportKey],
        market,
        marketLabel: MARKET_LABELS[market],
        startTime: event.startTime,
        status: event.status,
      },
      meta: {
        engine: this.engineId,
        engineMode: this.mode,
        modelVersion: model.modelVersion,
        contractVersion: ANALYSIS_CONTRACT_VERSION,
        computeMs: det(Date.now() - started, 'count', 'odds-math'),
        deterministicInputsDigest: model.inputsDigest,
        partial: degradedReasons.length > 0,
        degradedReasons,
      },
    };
  }
}
