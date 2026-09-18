import { describe, expect, it } from 'vitest';
import { consensusPrice, latestQuotesBySelection } from './oddsMath';
import type { OddsSnapshot } from '../types';

describe('oddsMath bookmaker resilience', () => {
  it('does not crash when a live snapshot contains an unknown bookmaker id', () => {
    const snapshots: OddsSnapshot[] = [
      {
        id: 'snap-unknown-book',
        eventId: 'EVT-TEST',
        market: 'match-winner',
        bookmaker: 'unknown-live-book',
        capturedAt: '2026-09-18T04:00:00.000Z',
        quotes: [{ selectionId: 'home', label: 'Home', decimalOdds: 2.4 }],
        feedLatencyMs: 120,
        provider: 'live-feed',
      },
      {
        id: 'snap-known-book',
        eventId: 'EVT-TEST',
        market: 'match-winner',
        bookmaker: 'betfair',
        capturedAt: '2026-09-18T04:01:00.000Z',
        quotes: [{ selectionId: 'home', label: 'Home', decimalOdds: 2.5 }],
        feedLatencyMs: 120,
        provider: 'live-feed',
      },
    ];

    const latest = latestQuotesBySelection(snapshots, 'home');

    expect(() => consensusPrice(latest)).not.toThrow();
    expect(consensusPrice(latest)).toBeGreaterThan(0);
  });
});
