import { det } from '../numbers';
import type { BookmakerId, DeterministicNumber, MarketKey, OddsSnapshot } from '../types';
import { BOOKMAKERS } from '../feed/normalization';

const SERVICE_ID = 'movement-service' as const;

export type MovementDirection = 'shortening' | 'drifting' | 'stable';

export interface MovementPoint {
  t: string;
  price: number;
  books: number;
}

export interface SelectionMovement {
  selectionId: string;
  label: string;
  openingPrice: DeterministicNumber;
  currentPrice: DeterministicNumber;
  changePct: DeterministicNumber;
  volatility: DeterministicNumber;
  direction: MovementDirection;
  steam: boolean;
  lastMoveAt: string;
  series: MovementPoint[];
}

export interface MarketMovement {
  eventId: string;
  market: MarketKey;
  selections: SelectionMovement[];
  maxAbsChangePct: DeterministicNumber;
  bookmakersTracked: BookmakerId[];
  snapshotCount: DeterministicNumber;
  firstCaptureAt: string;
  lastCaptureAt: string;
  steamDetected: boolean;
}

function consensusAt(
  snapshots: readonly OddsSnapshot[],
  timestamp: string,
  selectionId: string,
): { price: number; books: number } | null {
  const perBook = new Map<BookmakerId, number>();
  for (const snap of snapshots) {
    if (snap.capturedAt > timestamp) continue;
    const q = snap.quotes.find((x) => x.selectionId === selectionId);
    if (!q) continue;
    perBook.set(snap.bookmaker, q.decimalOdds);
  }
  if (!perBook.size) return null;
  let num = 0;
  let den = 0;
  for (const [book, price] of perBook) {
    const w = BOOKMAKERS[book]?.weight ?? 0.5;
    num += price * w;
    den += w;
  }
  return { price: num / den, books: perBook.size };
}

/**
 * Stage 4a: deterministic odds-movement analytics over canonical snapshots.
 * Produces the only movement numbers the intelligence layer is allowed to use.
 */
export function computeMarketMovement(
  eventId: string,
  market: MarketKey,
  allSnapshots: readonly OddsSnapshot[],
): MarketMovement | null {
  const snapshots = allSnapshots
    .filter((s) => s.eventId === eventId && s.market === market)
    .slice()
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  if (!snapshots.length) return null;

  const timestamps = [...new Set(snapshots.map((s) => s.capturedAt))].sort();
  const selectionIds = [
    ...new Map(
      snapshots.flatMap((s) => s.quotes.map((q) => [q.selectionId, q.label] as const)),
    ).entries(),
  ];

  const selections: SelectionMovement[] = selectionIds.map(([selectionId, label]) => {
    const series: MovementPoint[] = [];
    for (const t of timestamps) {
      const c = consensusAt(snapshots, t, selectionId);
      if (c) series.push({ t, price: Number(c.price.toFixed(3)), books: c.books });
    }
    const opening = series.length ? series[0].price : 0;
    const current = series.length ? series[series.length - 1].price : 0;
    const changePct = opening > 0 ? ((current - opening) / opening) * 100 : 0;

    const steps: number[] = [];
    for (let i = 1; i < series.length; i += 1) {
      steps.push(((series[i].price - series[i - 1].price) / series[i - 1].price) * 100);
    }
    const meanStep = steps.length ? steps.reduce((a, b) => a + b, 0) / steps.length : 0;
    const volatility = steps.length
      ? Math.sqrt(steps.reduce((a, b) => a + (b - meanStep) ** 2, 0) / steps.length)
      : 0;

    let lastMoveAt = series.length ? series[0].t : new Date().toISOString();
    for (let i = series.length - 1; i > 0; i -= 1) {
      if (Math.abs(series[i].price - series[i - 1].price) / series[i - 1].price > 0.005) {
        lastMoveAt = series[i].t;
        break;
      }
    }

    const direction: MovementDirection =
      changePct <= -1.5 ? 'shortening' : changePct >= 1.5 ? 'drifting' : 'stable';
    const monotone =
      steps.length > 2 &&
      steps.filter((s) => Math.sign(s) === Math.sign(changePct)).length / steps.length > 0.6;

    return {
      selectionId,
      label,
      openingPrice: det(opening, 'decimal-odds', SERVICE_ID),
      currentPrice: det(current, 'decimal-odds', SERVICE_ID),
      changePct: det(changePct, 'percent', SERVICE_ID),
      volatility: det(volatility, 'ratio', SERVICE_ID),
      direction,
      steam: Math.abs(changePct) >= 6 && monotone,
      lastMoveAt,
      series,
    };
  });

  const maxAbs = selections.reduce(
    (max, s) => Math.max(max, Math.abs(s.changePct.value)),
    0,
  );

  return {
    eventId,
    market,
    selections,
    maxAbsChangePct: det(maxAbs, 'percent', SERVICE_ID),
    bookmakersTracked: [...new Set(snapshots.map((s) => s.bookmaker))],
    snapshotCount: det(snapshots.length, 'count', SERVICE_ID),
    firstCaptureAt: timestamps[0],
    lastCaptureAt: timestamps[timestamps.length - 1],
    steamDetected: selections.some((s) => s.steam),
  };
}

export function primaryMarketFor(
  eventId: string,
  snapshots: readonly OddsSnapshot[],
): MarketKey | null {
  const counts = new Map<MarketKey, number>();
  for (const s of snapshots) {
    if (s.eventId !== eventId) continue;
    counts.set(s.market, (counts.get(s.market) ?? 0) + 1);
  }
  let best: MarketKey | null = null;
  let bestCount = -1;
  for (const [market, count] of counts) {
    if (count > bestCount) {
      best = market;
      bestCount = count;
    }
  }
  return best;
}
