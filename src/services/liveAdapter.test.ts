import { describe, expect, it } from 'vitest';
import { liveEvent, liveEvents } from './liveAdapter';
import type { CanonicalDataset } from '../domain/repositories';

const dataset: CanonicalDataset = {
  events: [{ id: 'e1', sportKey: 'soccer', league: { id: 'l1', name: 'Test League', sportKey: 'soccer', country: 'PL' }, homeTeam: { id: 'h', name: 'Home FC', shortName: 'Home', rating: .5, form: [], injuriesOut: 0 }, awayTeam: { id: 'a', name: 'Away FC', shortName: 'Away', rating: .5, form: [], injuriesOut: 0 }, startTime: new Date().toISOString(), status: 'scheduled', venue: '', monitored: true, liquidity: .8 }],
  snapshots: [{ id: 's1', eventId: 'e1', market: 'match-winner', bookmaker: 'book', capturedAt: new Date().toISOString(), quotes: [{ selectionId: 'q1', label: 'Home FC', decimalOdds: 2 }, { selectionId: 'q2', label: 'Away FC', decimalOdds: 2 }], feedLatencyMs: 10, provider: 'test' }],
  issues: [], droppedRecords: 0, normalizedAt: new Date().toISOString(), provider: 'demo', mode: 'DEMO'
};

describe('live adapter', () => {
  it('maps canonical events to legacy UI shape with selections', () => {
    const events = liveEvents(dataset);
    expect(events).toHaveLength(1);
    expect(events[0].competition).toBe('Test League');
    expect(events[0].markets[0].selections).toHaveLength(2);
    expect(events[0].markets[0].selections[0].odds).toBe(2);
    expect(events[0].markets[0].selections[0].probability).toBeCloseTo(.5);
  });
  it('returns undefined for an unknown event', () => {
    expect(liveEvent(dataset, 'missing')).toBeUndefined();
  });
});
