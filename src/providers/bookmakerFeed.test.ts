import { describe, expect, it } from 'vitest';
import { mergeBookmakerDatasets, resolveBookmakerProviders, selectBookmakerFeedProvider, type BookmakerFeedProvider } from './bookmakerFeed.js';

const makeProvider = (id: string, configured: boolean, capabilities: string[]): BookmakerFeedProvider => ({
  id, capabilities, isConfigured: () => configured,
  fetch: async () => ({ events: [], snapshots: [], issues: [], droppedRecords: 0, normalizedAt: new Date().toISOString() }),
});

describe('bookmaker provider abstraction', () => {
  it('resolves each requested bookmaker independently', () => {
    const resolutions = resolveBookmakerProviders([
      makeProvider('sts-provider', true, ['STS']),
      makeProvider('superbet-provider', true, ['Superbet']),
    ], { date: '2026-10-01', sport: 'all', bookmakers: ['STS', 'Superbet'] });
    expect(resolutions.map(r => [r.bookmaker, r.provider?.id])).toEqual([
      ['STS', 'sts-provider'], ['Superbet', 'superbet-provider'],
    ]);
  });

  it('does not treat partial coverage as full coverage', () => {
    const resolutions = resolveBookmakerProviders(
      [makeProvider('sts-provider', true, ['STS'])],
      { date: '2026-10-01', sport: 'all', bookmakers: ['STS', 'Superbet'] },
    );
    expect(resolutions[0].provider?.id).toBe('sts-provider');
    expect(resolutions[1].provider).toBeNull();
  });

  it('ignores providers without configuration', () => {
    const selected = selectBookmakerFeedProvider([makeProvider('test', false, ['STS', 'Superbet'])], {
      date: '2026-10-01', sport: 'all', bookmakers: ['STS'],
    });
    expect(selected).toBeNull();
  });

  it('merges datasets without duplicate events or snapshots', () => {
    const base = { events: [], snapshots: [], issues: [], droppedRecords: 0, normalizedAt: new Date().toISOString(), provider: 'odds-api.io' as const, mode: 'LIVE' as const, bookmakers: ['STS'] };
    const merged = mergeBookmakerDatasets([base, { ...base, bookmakers: ['Superbet'] }], ['STS', 'Superbet']);
    expect(merged.bookmakers).toEqual(['STS', 'Superbet']);
    expect(merged.mode).toBe('LIVE');
  });
});
