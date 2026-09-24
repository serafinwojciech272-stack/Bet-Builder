import { describe, expect, it } from 'vitest';
import type { CanonicalDataset } from '../domain/repositories';
import type { SportEvent } from '../domain/types';
import { MockAIAnalysisService } from '../ai/MockAIAnalysisService';
import { liveEvents } from '../services/liveAdapter';
import type { AnalysisError } from '../ai/AIAnalysisService';

/**
 * REAL-DATA → ANALYZE ALL reconciliation for event-only providers.
 *
 * Production runs TheSportsDB in `LIVE_DATA_NO_ODDS`: real events, no bookmaker
 * odds. The existing engine must process every event and represent the missing
 * odds as an explicit reason — never a silent drop, never fabricated odds.
 */

function realEvent(id: string, sportKey: SportEvent['sportKey'] = 'soccer'): SportEvent {
  return {
    id,
    sportKey,
    league: { id: 'l1', name: 'Swedish Hockey League', sportKey, country: 'Sweden' },
    homeTeam: { id: 'h', name: 'Djurgårdens IF', shortName: 'Djurgårdens IF', rating: 0.5, form: [], injuriesOut: 0 },
    awayTeam: { id: 'a', name: 'Växjö Lakers', shortName: 'Växjö Lakers', rating: 0.5, form: [], injuriesOut: 0 },
    startTime: '2026-09-24T17:00:00.000Z',
    status: 'scheduled',
    venue: 'Hovet',
    monitored: true,
    liquidity: 0.5,
  };
}

const noOddsDataset: CanonicalDataset = {
  events: [
    realEvent('thesportsdb:2476505', 'icehockey'),
    realEvent('thesportsdb:2269515'),
    realEvent('thesportsdb:2400139', 'baseball'),
  ],
  snapshots: [],
  issues: [],
  droppedRecords: 0,
  normalizedAt: '2026-09-24T17:23:48.273Z',
  provider: 'thesportsdb',
  mode: 'LIVE_DATA_NO_ODDS',
  requestedDate: '2026-09-24',
  sportsQueried: ['soccer', 'basketball', 'icehockey', 'baseball'],
  bookmakers: [],
};

class StaticRepository {
  constructor(private readonly data: CanonicalDataset) {}
  async loadCanonicalDataset() { return this.data; }
  async getEvent(id: string) { return this.data.events.find((e) => e.id === id) ?? null; }
  async getSnapshots(id: string) { return this.data.snapshots.filter((s) => s.eventId === id); }
}

describe('ANALYZE ALL on real event-only data', () => {
  it('reconciles input events to explicit results without silent drops', async () => {
    const service = new MockAIAnalysisService(new StaticRepository(noOddsDataset) as never, { latencyMs: 0 });
    const results = await Promise.all(
      noOddsDataset.events.map(async (event) => {
        try {
          return { id: event.id, status: 'ANALYSED' as const };
        } catch {
          return { id: event.id, status: 'ERROR' as const };
        }
      }),
    );
    expect(results).toHaveLength(noOddsDataset.events.length);

    const outcomes: Array<{ id: string; state: string; reason?: string }> = [];
    for (const event of noOddsDataset.events) {
      try {
        await service.analyzeEvent({ eventId: event.id, requestedBy: 'gate' });
        outcomes.push({ id: event.id, state: 'ANALYSED' });
      } catch (error) {
        const failure = error as AnalysisError;
        outcomes.push({ id: event.id, state: failure.code });
      }
    }

    // Every input event is represented — nothing disappears.
    expect(outcomes).toHaveLength(noOddsDataset.events.length);
    expect(new Set(outcomes.map((o) => o.id)).size).toBe(noOddsDataset.events.length);

    // Missing odds are represented by the repository's explicit state, not zero.
    expect(outcomes.every((o) => o.state === 'NO_MARKET_DATA')).toBe(true);
  });

  it('preserves provider provenance and identity through the UI projection', () => {
    const projected = liveEvents(noOddsDataset);
    expect(projected).toHaveLength(noOddsDataset.events.length);
    for (const [index, row] of projected.entries()) {
      const source = noOddsDataset.events[index];
      expect(row.id).toBe(source.id);
      expect(row.id.startsWith('thesportsdb:')).toBe(true);
      expect(row.homeTeam).toBe(source.homeTeam.name);
      expect(row.awayTeam).toBe(source.awayTeam.name);
      expect(row.competition).toBe(source.league.name);
      expect(row.startTime).toBe(source.startTime);
    }
  });

  it('does not fabricate odds for events without snapshots', () => {
    const projected = liveEvents(noOddsDataset);
    // No snapshots -> no markets -> no implied selections and no invented prices.
    expect(projected.every((row) => row.markets.length === 0)).toBe(true);
    const selections = projected.flatMap((row) => row.markets.flatMap((market) => market.selections));
    expect(selections).toEqual([]);
  });
});