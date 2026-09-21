import { describe, expect, it } from 'vitest';
import { computeMarketMovement } from '../domain/services/movementService';
import type { OddsSnapshot } from '../domain/types';

const snapshot = (
  id: string,
  capturedAt: string,
  bookmaker: string,
  odds: number,
): OddsSnapshot => ({
  id,
  eventId: 'EVT-REGRESSION',
  market: 'match-winner',
  bookmaker,
  capturedAt,
  feedLatencyMs: 20,
  provider: 'regression-fixture',
  quotes: [{ selectionId: 'SEL-HOME', label: 'Home', decimalOdds: odds }],
});

describe('Bet Builder full-flow runtime guard', () => {
  it('handles an unknown live bookmaker without throwing on weight lookup', () => {
    const snapshots = [
      snapshot('S1', '2026-09-21T08:00:00.000Z', 'knownbook', 2.00),
      snapshot('S2', '2026-09-21T08:05:00.000Z', 'unknown-live-book', 1.90),
    ];

    expect(() =>
      computeMarketMovement('EVT-REGRESSION', 'match-winner', snapshots),
    ).not.toThrow();

    const movement = computeMarketMovement(
      'EVT-REGRESSION',
      'match-winner',
      snapshots,
    );

    expect(movement?.selections).toHaveLength(1);
    expect(movement?.selections[0]?.currentPrice.value).toBeGreaterThan(0);
    expect(movement?.bookmakersTracked).toContain('unknown-live-book');
  });

  it('keeps movement output finite when every bookmaker is unknown', () => {
    const snapshots = [
      snapshot('S1', '2026-09-21T08:00:00.000Z', 'unknown-a', 2.10),
      snapshot('S2', '2026-09-21T08:05:00.000Z', 'unknown-b', 2.00),
    ];

    const movement = computeMarketMovement(
      'EVT-REGRESSION',
      'match-winner',
      snapshots,
    );

    expect(Number.isFinite(movement?.selections[0]?.currentPrice.value ?? NaN)).toBe(true);
    expect(Number.isFinite(movement?.selections[0]?.changePct.value ?? NaN)).toBe(true);
  });
});
