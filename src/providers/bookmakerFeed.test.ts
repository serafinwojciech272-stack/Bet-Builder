import { describe, expect, it } from 'vitest';
import { selectBookmakerFeedProvider, type BookmakerFeedProvider } from './bookmakerFeed.js';

const makeProvider = (configured: boolean, capabilities: string[]): BookmakerFeedProvider => ({
  id: 'test',
  capabilities,
  isConfigured: () => configured,
  fetch: async () => ({ events: [], snapshots: [], issues: [], droppedRecords: 0, normalizedAt: new Date().toISOString() }),
});

describe('bookmaker provider abstraction', () => {
  it('selects a configured provider matching requested bookmaker', () => {
    const selected = selectBookmakerFeedProvider([makeProvider(true, ['STS'])], {
      date: '2026-10-01', sport: 'all', bookmakers: ['STS', 'Superbet'],
    });
    expect(selected?.id).toBe('test');
  });

  it('ignores providers without configuration', () => {
    const selected = selectBookmakerFeedProvider([makeProvider(false, ['STS', 'Superbet'])], {
      date: '2026-10-01', sport: 'all', bookmakers: ['STS'],
    });
    expect(selected).toBeNull();
  });

  it('returns null when no requested bookmaker exists', () => {
    const selected = selectBookmakerFeedProvider([makeProvider(true, ['STS'])], {
      date: '2026-10-01', sport: 'all', bookmakers: [],
    });
    expect(selected).toBeNull();
  });
});
