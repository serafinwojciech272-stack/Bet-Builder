import type { CanonicalDataset } from '../domain/repositories';
import type { CouponResult } from './couponEngine';
import { devigMarket } from './marketDevig';

export type LiveCertificationStatus = 'CERTIFIED' | 'REVIEW' | 'BLOCKED' | 'NO_LIVE_DATA';
export type FreshnessBand = 'FRESH' | 'AGING' | 'STALE' | 'UNKNOWN';

export interface CouponDataProvenance {
  provider: string;
  mode: string;
  capturedAt: string | null;
  normalizedAt: string;
  eventCount: number;
  snapshotCount: number;
  bookmakerCount: number;
  bookmakers: string[];
  realData: boolean;
  liveOdds: boolean;
  warnings: string[];
}

export interface CouponFreshness {
  band: FreshnessBand;
  ageSeconds: number;
  staleAfterSeconds: number;
  score: number;
}

export interface BookmakerPrice {
  bookmaker: string;
  odds: number;
  capturedAt: string;
}

export interface LegCertification {
  eventId: string;
  selectionId: string;
  label: string;
  odds: number;
  probability: number;
  ev: number;
  bookmakers: BookmakerPrice[];
  bookmakerCount: number;
  bestOdds: number;
  consensusOdds: number;
  fairProbability: number;
  correlationGroup: string;
  valid: boolean;
  reasons: string[];
}

export interface CouponCertification {
  status: LiveCertificationStatus;
  generatedAt: string;
  provenance: CouponDataProvenance;
  freshness: CouponFreshness;
  legs: LegCertification[];
  targetOdds: number;
  combinedOdds: number;
  independentEdge: number;
  correlationPenalty: number;
  reasons: string[];
  gate: {
    humanApprovalRequired: true;
    executionAllowed: false;
    monetaryExecution: false;
  };
  evidenceHash: string;
}

const finite = (n: number) => Number.isFinite(n);
const clamp = (n: number) => Math.max(0, Math.min(1, n));

export function couponDataProvenance(dataset: CanonicalDataset): CouponDataProvenance {
  const bookmakers = dataset.bookmakers?.length
    ? [...dataset.bookmakers]
    : [...new Set(dataset.snapshots.map(s => String(s.bookmaker)))];
  const liveOdds = dataset.mode === 'LIVE' && dataset.snapshots.length > 0;
  return {
    provider: dataset.provider ?? 'unknown',
    mode: dataset.mode ?? 'UNKNOWN',
    capturedAt: dataset.snapshots.length
      ? dataset.snapshots.map(s => s.capturedAt).sort().at(-1) ?? null
      : null,
    normalizedAt: dataset.normalizedAt,
    eventCount: dataset.events.length,
    snapshotCount: dataset.snapshots.length,
    bookmakerCount: bookmakers.length,
    bookmakers,
    realData: dataset.provider !== 'demo' && dataset.mode !== 'DEMO',
    liveOdds,
    warnings: dataset.providerHealth?.warnings ?? dataset.issues.map(i => i.message).slice(0, 6),
  };
}

export function couponFreshness(dataset: CanonicalDataset, now = Date.now()): CouponFreshness {
  const source = dataset.snapshots.map(s => Date.parse(s.capturedAt)).filter(Number.isFinite);
  const fetched = source.length ? Math.max(...source) : Date.parse(dataset.normalizedAt);
  if (!Number.isFinite(fetched)) return { band: 'UNKNOWN', ageSeconds: Infinity, staleAfterSeconds: 120, score: 0 };
  const ageSeconds = Math.max(0, Math.round((now - fetched) / 1000));
  const staleAfterSeconds = dataset.providerHealth?.staleAfterSeconds ?? 120;
  const band: FreshnessBand = ageSeconds <= staleAfterSeconds ? 'FRESH' : ageSeconds <= staleAfterSeconds * 2 ? 'AGING' : 'STALE';
  return { band, ageSeconds, staleAfterSeconds, score: clamp(1 - ageSeconds / Math.max(1, staleAfterSeconds * 2)) };
}

function snapshotQuotes(dataset: CanonicalDataset, eventId: string, selectionLabel: string): BookmakerPrice[] {
  const key = selectionLabel.trim().toLowerCase();
  return dataset.snapshots
    .filter(s => s.eventId === eventId)
    .flatMap(s => s.quotes
      .filter(q => q.label.trim().toLowerCase() === key)
      .map(q => ({ bookmaker: String(s.bookmaker), odds: q.decimalOdds, capturedAt: s.capturedAt })))
    .filter(q => finite(q.odds) && q.odds > 1)
    .sort((a, b) => b.odds - a.odds);
}

function fairProbabilityForSelection(dataset: CanonicalDataset, eventId: string, selectionLabel: string, fallback: number): number {
  const labelKey = selectionLabel.trim().toLowerCase();
  const bestByLabel = new Map<string, { selectionId: string; odds: number }>();
  for (const snapshot of dataset.snapshots) {
    if (snapshot.eventId !== eventId) continue;
    for (const quote of snapshot.quotes) {
      if (!finite(quote.decimalOdds) || quote.decimalOdds <= 1) continue;
      const key = quote.label.trim().toLowerCase();
      const current = bestByLabel.get(key);
      if (!current || quote.decimalOdds > current.odds) {
        bestByLabel.set(key, { selectionId: key || quote.selectionId, odds: quote.decimalOdds });
      }
    }
  }
  const market = [...bestByLabel.values()];
  if (market.length < 2) return clamp(fallback);
  try {
    const result = devigMarket(market);
    return result.prices.find(p => p.selectionId === labelKey)?.fairProbability ?? clamp(fallback);
  } catch {
    return clamp(fallback);
  }
}

export function certifyCoupon(dataset: CanonicalDataset, coupon: CouponResult, now = Date.now()): CouponCertification {
  const generatedAt = new Date(now).toISOString();
  const provenance = couponDataProvenance(dataset);
  const freshness = couponFreshness(dataset, now);
  const reasons: string[] = [];
  if (!provenance.realData) reasons.push('DEMO_DATA');
  if (!provenance.liveOdds) reasons.push('NO_LIVE_ODDS');
  if (freshness.band === 'STALE' || freshness.band === 'UNKNOWN') reasons.push('STALE_OR_UNKNOWN_FRESHNESS');
  if (dataset.providerHealth?.state === 'OFFLINE') reasons.push('PROVIDER_OFFLINE');
  if (dataset.providerHealth?.state === 'DEGRADED') reasons.push('SOURCE_DEGRADED');

  const legs: LegCertification[] = coupon.legs.map(leg => {
    const books = snapshotQuotes(dataset, leg.eventId, leg.label);
    const bestOdds = books[0]?.odds ?? leg.marketOdds;
    const avg = books.length ? books.reduce((a, b) => a + b.odds, 0) / books.length : leg.marketOdds;
    const fairProbability = fairProbabilityForSelection(dataset, leg.eventId, leg.label, leg.probability);
    const independentEdge = leg.probability - fairProbability;
    const legReasons: string[] = [];
    if (!books.length) legReasons.push('NO_BOOKMAKER_SNAPSHOT');
    if (books.length < 2) legReasons.push('SINGLE_BOOKMAKER');
    if (!finite(leg.probability) || leg.probability <= 0 || leg.probability >= 1) legReasons.push('INVALID_PROBABILITY');
    if (!finite(bestOdds) || bestOdds <= 1) legReasons.push('INVALID_ODDS');
    return {
      eventId: leg.eventId, selectionId: leg.selectionId, label: leg.label, odds: leg.marketOdds,
      probability: leg.probability, ev: leg.ev, bookmakers: books, bookmakerCount: books.length,
      bestOdds, consensusOdds: avg, fairProbability, correlationGroup: leg.marketId,
      valid: legReasons.length === 0, reasons: legReasons,
    };
  });

  const groups = new Map<string, number>();
  for (const leg of coupon.legs) groups.set(leg.marketId, (groups.get(leg.marketId) ?? 0) + 1);
  const duplicated = [...groups.values()].some(n => n > 1);
  const correlationPenalty = duplicated ? 0.25 : 0;
  const meanIndependentEdge = legs.length ? legs.reduce((a, l) => a + (l.probability - l.fairProbability), 0) / legs.length : 0;
  const independentEdge = meanIndependentEdge - correlationPenalty;
  if (duplicated) reasons.push('CORRELATED_OR_DUPLICATE_MARKET');
  for (const leg of legs) reasons.push(...leg.reasons.map(r => leg.selectionId + ':' + r));

  const blocked = !coupon.legs.length || reasons.includes('NO_LIVE_ODDS') || reasons.includes('DEMO_DATA') ||
    freshness.band === 'STALE' || dataset.providerHealth?.state === 'OFFLINE' || legs.some(l => !l.valid);
  const status: LiveCertificationStatus = blocked ? (!provenance.liveOdds ? 'NO_LIVE_DATA' : 'BLOCKED')
    : reasons.length || coupon.status !== 'READY' || freshness.band === 'AGING' ? 'REVIEW' : 'CERTIFIED';

  const evidence = JSON.stringify({
    generatedAt, provenance, freshness, legs, targetOdds: coupon.targetOdds, combinedOdds: coupon.combinedOdds,
    independentEdge, correlationPenalty, reasons,
  });
  let hash = 0;
  for (let i = 0; i < evidence.length; i++) hash = ((hash << 5) - hash + evidence.charCodeAt(i)) | 0;

  return {
    status, generatedAt, provenance, freshness, legs, targetOdds: coupon.targetOdds, combinedOdds: coupon.combinedOdds,
    independentEdge, correlationPenalty, reasons, gate: { humanApprovalRequired: true, executionAllowed: false, monetaryExecution: false },
    evidenceHash: Math.abs(hash).toString(16).padStart(8, '0'),
  };
}

export function certificationLabel(status: LiveCertificationStatus): string {
  return {
    CERTIFIED: 'LIVE CERTIFIED',
    REVIEW: 'LIVE REVIEW',
    BLOCKED: 'BLOCKED',
    NO_LIVE_DATA: 'NO LIVE ODDS',
  }[status];
}
