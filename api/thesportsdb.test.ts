import { describe, expect, it, vi, afterEach } from 'vitest';
import handler from './odds.js';

type Res = { statusCode: number; body: unknown; status(code: number): Res; setHeader(name: string, value: string): Res; end(body: string): void };
type Issue = { code: string; severity: string; message: string; reference?: string };
type OddsBody = {
  events: Array<{ id: string; sportKey: string; league: { id: string; name: string; country: string }; homeTeam: { id: string; name: string }; awayTeam: { id: string; name: string }; startTime: string; status: string; venue: string }>;
  snapshots: unknown[];
  bookmakers: unknown[];
  provider: string;
  mode: string;
  sportsQueried: string[];
  issues: Issue[];
  providerHealth: { provider: string; state: string; eventCount: number; queriedSports: number; failedSports: number; snapshotCount: number; bookmakerCount: number };
};
function response(): Res {
  const r: Res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, setHeader() { return this; }, end(body) { this.body = JSON.parse(body); } };
  return r;
}
function bodyOf(res: Res): OddsBody { return res.body as OddsBody; }

const REAL_EVENTS = [
  { idEvent: '2269515', strEvent: 'Belgium U21 vs Belarus U21', strSport: 'Soccer', strLeague: 'UEFA European Under-21 Championship', strHomeTeam: 'Belgium U21', strAwayTeam: 'Belarus U21', strTimestamp: '2026-09-24T15:00:00', dateEvent: '2026-09-24', dateEventLocal: '2026-09-24', strTime: '15:00:00', strStatus: 'NS', strVenue: 'Stade Roi Baudouin', strCountry: 'Belgium' },
  { idEvent: '2269488', strEvent: 'Feyenoord vs Celtic', strSport: 'Soccer', strLeague: 'UEFA Europa League', strHomeTeam: 'Feyenoord', strAwayTeam: 'Celtic', strTimestamp: '2026-09-24T19:00:00', strTime: '19:00:00', strStatus: 'FT', strVenue: 'Stadion Feijenoord', strCountry: 'Netherlands' },
  { idEvent: '2269501', strEvent: 'Seattle Storm vs Dallas Wings', strSport: 'Basketball', strLeague: 'Womens National Basketball Association', strHomeTeam: 'Seattle Storm', strAwayTeam: 'Dallas Wings', strTimestamp: '2026-09-24T17:30:00', strTime: '17:30:00', strStatus: '1H', strCountry: 'United States' },
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
// SportScore is always exhausted first on the keyless path; individual tests override
// only the TheSportsDB branch they exercise.
function isTheSportsDb(url: string) { return url.includes('thesportsdb.com'); }
function installFetch(theSportsDb: (url: URL) => Response | Promise<Response>, sportScore: (url: URL) => Response = () => jsonResponse({ matches: [] })) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (isTheSportsDb(url.toString())) return theSportsDb(url);
    return sportScore(url);
  }));
}
// The real API only returns events for the queried sport label, so the fixture
// mirrors that by matching each event's strSport to the `s=` parameter.
function eventsFor(url: URL, events: unknown[] | null) {
  if (events === null) return jsonResponse({ events: null });
  const sport = url.searchParams.get('s');
  const matching = events.filter((event) => (event as { strSport?: string }).strSport === sport);
  return jsonResponse({ events: matching.length ? matching : null });
}

describe('TheSportsDB fallback provider', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
  it('returns real events as LIVE_DATA_NO_ODDS without fabricating odds', async () => {
    vi.stubEnv('PARLAY_API_KEY', '');
    installFetch((url) => eventsFor(url, REAL_EVENTS));
    const res = response();
    await handler({ method: 'GET', query: { date: '2026-09-24', sport: 'all' } }, res);
    expect(res.statusCode).toBe(200);
    expect(bodyOf(res).provider).toBe('thesportsdb');
    expect(bodyOf(res).mode).toBe('LIVE_DATA_NO_ODDS');
    expect(bodyOf(res).snapshots).toEqual([]);
    expect(bodyOf(res).bookmakers).toEqual([]);
    expect(bodyOf(res).events.length).toBeGreaterThan(0);
  });

  it('normalizes real events into the SportEvent contract', async () => {
    vi.stubEnv('PARLAY_API_KEY', '');
    installFetch((url) => eventsFor(url, REAL_EVENTS));
    const res = response();
    await handler({ method: 'GET', query: { date: '2026-09-24', sport: 'all' } }, res);
    const soccer = bodyOf(res).events.find((event) => event.id === 'thesportsdb:2269515');
    expect(soccer).toBeDefined();
    expect(soccer).toMatchObject({ sportKey: 'soccer', status: 'scheduled' });
    expect(soccer?.homeTeam).toMatchObject({ name: 'Belgium U21', id: 'belgium-u21' });
    expect(soccer?.awayTeam.name).toBe('Belarus U21');
    expect(soccer?.league).toMatchObject({ id: 'uefa-european-under-21-championship', name: 'UEFA European Under-21 Championship', country: 'Belgium' });
    expect(soccer?.startTime).toBe('2026-09-24T15:00:00.000Z');
    expect(soccer?.venue).toBe('Stade Roi Baudouin');
  });

  it('maps multiple sports and statuses from one response set', async () => {
    vi.stubEnv('PARLAY_API_KEY', '');
    installFetch((url) => eventsFor(url, REAL_EVENTS));
    const res = response();
    await handler({ method: 'GET', query: { date: '2026-09-24', sport: 'all' } }, res);
    const byId = new Map(bodyOf(res).events.map((event) => [event.id, event]));
    expect(byId.get('thesportsdb:2269515')?.status).toBe('scheduled');
    expect(byId.get('thesportsdb:2269488')?.status).toBe('final');
    expect(byId.get('thesportsdb:2269501')?.status).toBe('live');
    expect(byId.get('thesportsdb:2269501')?.sportKey).toBe('basketball');
  });

  it('filters out events that fall outside the requested date', async () => {
    vi.stubEnv('PARLAY_API_KEY', '');
    const offDate = [
      { idEvent: 'zz1', strSport: 'Soccer', strLeague: 'Test Cup', strHomeTeam: 'Late FC', strAwayTeam: 'Next FC', strTimestamp: '2026-09-24T23:30:00', strTime: '23:30:00', strStatus: 'NS' },
      { idEvent: 'zz2', strSport: 'Soccer', strLeague: 'Test Cup', strHomeTeam: 'Prev FC', strAwayTeam: 'Early FC', strTimestamp: '2026-09-23T20:00:00', strTime: '20:00:00', strStatus: 'NS' },
      ...REAL_EVENTS,
    ];
    installFetch((url) => eventsFor(url, offDate));
    const res = response();
    await handler({ method: 'GET', query: { date: '2026-09-24', sport: 'all' } }, res);
    const ids = bodyOf(res).events.map((event) => event.id);
    expect(ids).not.toContain('thesportsdb:zz1');
    expect(ids).not.toContain('thesportsdb:zz2');
    expect(ids).toContain('thesportsdb:2269515');
  });

  it('handles missing optional fields gracefully', async () => {
    vi.stubEnv('PARLAY_API_KEY', '');
    const sparse = [{ idEvent: 'sparse1', strSport: 'Soccer', strHomeTeam: 'Home FC', strAwayTeam: 'Away FC', dateEvent: '2026-09-24', strTime: '12:00:00' }];
    installFetch((url) => eventsFor(url, sparse));
    const res = response();
    await handler({ method: 'GET', query: { date: '2026-09-24', sport: 'all' } }, res);
    expect(res.statusCode).toBe(200);
    const event = bodyOf(res).events[0];
    expect(event).toMatchObject({ id: 'thesportsdb:sparse1', status: 'scheduled', venue: '' });
    expect(event.league.country).toBe('International');
    expect(event.startTime).toBe('2026-09-24T12:00:00.000Z');
  });

  it('filters by requested sport instead of returning a generic feed', async () => {
    vi.stubEnv('PARLAY_API_KEY', '');
    const sportsQueried: string[] = [];
    installFetch((url) => { sportsQueried.push(url.searchParams.get('s') ?? ''); return eventsFor(url, REAL_EVENTS); });
    const res = response();
    await handler({ method: 'GET', query: { date: '2026-09-24', sport: 'soccer' } }, res);
    expect(res.statusCode).toBe(200);
    expect([...new Set(sportsQueried)]).toEqual(['Soccer']);
    expect(bodyOf(res).events.every((event) => event.sportKey === 'soccer')).toBe(true);
  });

  it('reports an empty provider feed as NO_SPORTS_PROVIDER_AVAILABLE', async () => {
    vi.stubEnv('PARLAY_API_KEY', '');
    installFetch((url) => eventsFor(url, []));
    const res = response();
    await handler({ method: 'GET', query: { date: '2026-09-24', sport: 'all' } }, res);
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ error: 'NO_SPORTS_PROVIDER_AVAILABLE' });
    expect(bodyOf(res).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'no-thesportsdb-events' })]));
  });

  it('degrades cleanly on malformed provider JSON', async () => {
    vi.stubEnv('PARLAY_API_KEY', '');
    installFetch(() => new Response('<html>not json</html>', { status: 200 }));
    const res = response();
    await handler({ method: 'GET', query: { date: '2026-09-24', sport: 'all' } }, res);
    expect(res.statusCode).toBe(503);
    expect(bodyOf(res).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'thesportsdb-payload-error' })]));
  });

  it('degrades cleanly on provider HTTP failure', async () => {
    vi.stubEnv('PARLAY_API_KEY', '');
    installFetch(() => new Response('upstream unavailable', { status: 500 }));
    const res = response();
    await handler({ method: 'GET', query: { date: '2026-09-24', sport: 'all' } }, res);
    expect(res.statusCode).toBe(503);
    expect(bodyOf(res).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'thesportsdb-error' })]));
  });

  it('degrades cleanly on provider timeout', async () => {
    vi.stubEnv('PARLAY_API_KEY', '');
    installFetch(() => { throw Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }); });
    const res = response();
    await handler({ method: 'GET', query: { date: '2026-09-24', sport: 'all' } }, res);
    expect(res.statusCode).toBe(503);
    expect(bodyOf(res).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'thesportsdb-error', message: expect.stringContaining('timeout') })]));
  });

  it('surfaces rate limiting without a request storm', async () => {
    vi.stubEnv('PARLAY_API_KEY', '');
    const calls: string[] = [];
    installFetch((url) => { calls.push(url.toString()); return new Response('rate limited', { status: 429 }); });
    const res = response();
    await handler({ method: 'GET', query: { date: '2026-09-24', sport: 'all' } }, res);
    expect(res.statusCode).toBe(503);
    expect(bodyOf(res).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'thesportsdb-rate-limited' })]));
    // Ten mapped sports are covered in bounded waves, never an unbounded burst.
    expect(calls.length).toBe(10);
  });

  it('exposes provider health shape without credentials', async () => {
    vi.stubEnv('PARLAY_API_KEY', '');
    installFetch((url) => eventsFor(url, REAL_EVENTS));
    const res = response();
    await handler({ method: 'GET', query: { date: '2026-09-24', sport: 'all' } }, res);
    const health = bodyOf(res).providerHealth;
    expect(health).toMatchObject({ provider: 'thesportsdb', state: 'HEALTHY', snapshotCount: 0, bookmakerCount: 0 });
    expect(health.eventCount).toBeGreaterThan(0);
    expect(JSON.stringify(bodyOf(res))).not.toMatch(/api[_-]?key/i);
  });

  it('prefers SportScore and only falls through to TheSportsDB when it is empty', async () => {
    vi.stubEnv('PARLAY_API_KEY', '');
    installFetch(
      (url) => eventsFor(url, REAL_EVENTS),
      () => jsonResponse({ matches: [{ id: 'm1', home: 'Alpha', away: 'Beta', time: '2026-09-24T10:00:00Z', league: 'SportScore Cup', status: 'NS' }] }),
    );
    const res = response();
    await handler({ method: 'GET', query: { date: '2026-09-24', sport: 'all' } }, res);
    expect(bodyOf(res).provider).toBe('sportscore');
    expect(bodyOf(res).events[0].id).toContain('sportscore:');
  });

  it('keeps provider order ParlayAPI → The Odds API → SportScore → TheSportsDB when a key is set', async () => {
    vi.stubEnv('PARLAY_API_KEY', 'test-key');
    vi.stubEnv('ODDS_API_KEY', 'odds-key');
    const hostOrder: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const host = url.hostname;
      if (!hostOrder.includes(host)) hostOrder.push(host);
      if (host === 'parlay-api.com') return jsonResponse([]);
      if (host === 'api.the-odds-api.com') return jsonResponse([]);
      if (host === 'sportscore.com') return jsonResponse({ matches: [] });
      return eventsFor(url, REAL_EVENTS);
    }));
    const res = response();
    await handler({ method: 'GET', query: { date: '2026-09-24', sport: 'all' } }, res);
    expect(res.statusCode).toBe(200);
    expect(bodyOf(res).provider).toBe('thesportsdb');
    expect(hostOrder.indexOf('parlay-api.com')).toBeLessThan(hostOrder.indexOf('api.the-odds-api.com'));
    expect(hostOrder.indexOf('api.the-odds-api.com')).toBeLessThan(hostOrder.indexOf('sportscore.com'));
    expect(hostOrder.indexOf('sportscore.com')).toBeLessThan(hostOrder.indexOf('www.thesportsdb.com'));
  });
});
