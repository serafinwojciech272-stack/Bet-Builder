import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSportsGameOdds } from './odds.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('SportsGameOdds adapter', () => {
  it('normalizes live NFL events and American odds into the domain contract', async () => {
    vi.stubEnv('SPORTSODDS_API_KEY', 'test-sgo-key');
    vi.stubEnv('SPORTSGAMEODDS_API_KEY', '');
    const payload = {
      success: true,
      data: [{
        eventID: 'nfl-test-2026',
        sportID: 'FOOTBALL',
        leagueID: 'NFL',
        teams: {
          home: { names: { long: 'Kansas City Chiefs' } },
          away: { names: { long: 'Buffalo Bills' } },
        },
        status: { startsAt: '2026-10-11T17:00:00Z', started: false, live: false, ended: false },
        odds: {
          'points-home-game-ml-home': {
            oddID: 'points-home-game-ml-home',
            statID: 'points',
            statEntityID: 'home',
            periodID: 'game',
            betTypeID: 'ml',
            sideID: 'home',
            byBookmaker: {
              fanduel: { odds: -110, lastUpdatedAt: '2026-10-11T16:00:00Z', available: true },
            },
          },
        },
      }],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get('leagueID')).toBe('NFL');
      expect(url.searchParams.has('sportID')).toBe(false);
      expect(url.searchParams.has('includeAltLines')).toBe(false);
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const issues: Parameters<typeof fetchSportsGameOdds>[2] = [];
    const result = await fetchSportsGameOdds('2026-10-11', 'americanfootball_nfl', issues);

    expect(result?.provider).toBe('sportsgameodds');
    expect(result?.events).toHaveLength(1);
    expect(result?.snapshots).toHaveLength(1);
    expect(result?.snapshots[0].market).toBe('match-winner');
    expect(result?.snapshots[0].quotes[0].decimalOdds).toBe(1.909);
    expect(result?.providerHealth.state).toBe('HEALTHY');
    expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'sportsgameodds-primary' })]));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caches subscription-restricted leagues and keeps the fallback path', async () => {
    vi.stubEnv('SPORTSODDS_API_KEY', 'test-sgo-key');
    vi.stubEnv('SPORTSGAMEODDS_API_KEY', '');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: false,
      error: 'The leagueID EPL is unavailable at your current subscription tier. Upgrade to unlock.',
    }), { status: 400, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const firstIssues: Parameters<typeof fetchSportsGameOdds>[2] = [];
    const first = await fetchSportsGameOdds('2026-10-09', 'soccer_epl', firstIssues);
    expect(first).toBeNull();
    expect(firstIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'sportsgameodds-error',
        message: expect.stringContaining('unavailable at your current subscription tier'),
      }),
    ]));

    const secondIssues: Parameters<typeof fetchSportsGameOdds>[2] = [];
    const second = await fetchSportsGameOdds('2026-10-10', 'soccer_epl', secondIssues);
    expect(second).toBeNull();
    expect(secondIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'sportsgameodds-tier-restriction' }),
    ]));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
