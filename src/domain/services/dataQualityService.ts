import { det } from '../numbers';
import type {
  DeterministicNumber,
  MarketKey,
  NormalizationIssue,
  OddsSnapshot,
} from '../types';
import { latestQuotesBySelection, priceDispersion } from './oddsMath';

const SERVICE_ID = 'data-quality-service' as const;

export type QualityGrade = 'A' | 'B' | 'C' | 'D';

export interface DataQualityIssue {
  code: 'stale-feed' | 'thin-coverage' | 'missing-quotes' | 'price-dispersion' | 'high-latency' | 'normalization';
  severity: 'info' | 'warning' | 'error';
  message: string;
}

export interface DataQualityReport {
  eventId: string;
  market: MarketKey;
  score: DeterministicNumber;
  grade: QualityGrade;
  freshnessMinutes: DeterministicNumber;
  bookmakerCoverage: DeterministicNumber;
  completeness: DeterministicNumber;
  dispersion: DeterministicNumber;
  avgLatencyMs: DeterministicNumber;
  stale: boolean;
  partial: boolean;
  issues: DataQualityIssue[];
  evaluatedAt: string;
}

const EXPECTED_BOOKS = 5;
const STALE_MINUTES = 30;

/** Stage 4b: deterministic data-quality scoring. */
export function assessDataQuality(
  eventId: string,
  market: MarketKey,
  allSnapshots: readonly OddsSnapshot[],
  normalizationIssues: readonly NormalizationIssue[] = [],
  now: Date = new Date(),
): DataQualityReport {
  const snapshots = allSnapshots.filter((s) => s.eventId === eventId && s.market === market);
  const issues: DataQualityIssue[] = [];

  const books = new Set(snapshots.map((s) => s.bookmaker));
  const coverage = books.size / EXPECTED_BOOKS;
  const latest = snapshots.reduce<string>(
    (max, s) => (s.capturedAt > max ? s.capturedAt : max),
    snapshots.length ? snapshots[0].capturedAt : new Date(0).toISOString(),
  );
  const freshnessMinutes = snapshots.length
    ? (now.getTime() - new Date(latest).getTime()) / 60_000
    : Number.POSITIVE_INFINITY;

  const selectionIds = [...new Set(snapshots.flatMap((s) => s.quotes.map((q) => q.selectionId)))];
  const expectedQuotes = selectionIds.length * books.size;
  const observedQuotes = selectionIds.reduce(
    (sum, sel) => sum + latestQuotesBySelection(snapshots, sel).length,
    0,
  );
  const completeness = expectedQuotes > 0 ? observedQuotes / expectedQuotes : 0;

  const dispersion =
    selectionIds.length > 0
      ? selectionIds.reduce(
          (sum, sel) => sum + priceDispersion(latestQuotesBySelection(snapshots, sel)),
          0,
        ) / selectionIds.length
      : 0;

  const avgLatency = snapshots.length
    ? snapshots.reduce((a, s) => a + s.feedLatencyMs, 0) / snapshots.length
    : 0;

  const stale = freshnessMinutes > STALE_MINUTES;
  if (stale) {
    issues.push({
      code: 'stale-feed',
      severity: freshnessMinutes > 60 ? 'error' : 'warning',
      message: `Latest capture is ${Number.isFinite(freshnessMinutes) ? Math.round(freshnessMinutes) : '—'} minutes old (threshold ${STALE_MINUTES}m)`,
    });
  }
  if (books.size < 3) {
    issues.push({
      code: 'thin-coverage',
      severity: books.size <= 1 ? 'error' : 'warning',
      message: `Only ${books.size} bookmaker${books.size === 1 ? '' : 's'} reporting on this market`,
    });
  }
  if (completeness < 0.95) {
    issues.push({
      code: 'missing-quotes',
      severity: completeness < 0.8 ? 'error' : 'warning',
      message: `${Math.round((1 - completeness) * 100)}% of expected selection quotes are missing`,
    });
  }
  if (dispersion > 0.035) {
    issues.push({
      code: 'price-dispersion',
      severity: 'warning',
      message: `Cross-book price dispersion at ${(dispersion * 100).toFixed(1)}% — consensus is unreliable`,
    });
  }
  if (avgLatency > 400) {
    issues.push({
      code: 'high-latency',
      severity: 'info',
      message: `Average feed latency ${Math.round(avgLatency)}ms`,
    });
  }
  for (const n of normalizationIssues) {
    if (n.reference && n.reference.includes(eventId)) {
      issues.push({ code: 'normalization', severity: n.severity, message: n.message });
    }
  }

  const freshnessScore = Number.isFinite(freshnessMinutes)
    ? Math.max(0, 1 - freshnessMinutes / 90)
    : 0;
  const dispersionScore = Math.max(0, 1 - dispersion / 0.06);
  const latencyScore = Math.max(0, 1 - avgLatency / 1200);
  const score =
    0.34 * freshnessScore +
    0.26 * Math.min(1, coverage) +
    0.22 * completeness +
    0.12 * dispersionScore +
    0.06 * latencyScore;

  const grade: QualityGrade = score >= 0.85 ? 'A' : score >= 0.7 ? 'B' : score >= 0.5 ? 'C' : 'D';

  return {
    eventId,
    market,
    score: det(score, 'ratio', SERVICE_ID),
    grade,
    freshnessMinutes: det(Number.isFinite(freshnessMinutes) ? freshnessMinutes : 9999, 'minutes', SERVICE_ID),
    bookmakerCoverage: det(Math.min(1, coverage), 'ratio', SERVICE_ID),
    completeness: det(completeness, 'ratio', SERVICE_ID),
    dispersion: det(dispersion, 'ratio', SERVICE_ID),
    avgLatencyMs: det(avgLatency, 'count', SERVICE_ID),
    stale,
    partial: completeness < 0.95 || books.size < 3,
    issues,
    evaluatedAt: now.toISOString(),
  };
}
