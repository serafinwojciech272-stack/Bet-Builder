import { describe, expect, it, vi, afterEach } from 'vitest';
import handler from './odds.js';

type Res = { statusCode: number; body: unknown; status(code:number): Res; setHeader(name:string,value:string): Res; end(body:string): void };
function response(): Res {
  const r: Res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    setHeader() { return this; },
    end(body) { this.body = JSON.parse(body); },
  };
  return r;
}

describe('odds API contract', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('rejects missing provider configuration', async () => {
    vi.stubEnv('PARLAY_API_KEY', '');
    const res = response();
    await handler({ method: 'GET', query: {} }, res);
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ error: 'ODDS_PROVIDER_NOT_CONFIGURED' });
  });

  it('rejects malformed dates before provider calls', async () => {
    vi.stubEnv('PARLAY_API_KEY', 'test-key');
    const res = response();
    await handler({ method: 'GET', query: { date: '2026/09/18' } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: 'INVALID_DATE' });
  });

  it('normalizes a minimal provider response', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-18T12:01:00Z'));
    vi.stubEnv('PARLAY_API_KEY', 'test-key');
    const payload = [{ key: 'soccer_test', group: 'soccer', title: 'Test Soccer', active: true, has_outrights: false }];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/sports/?')) {
        return new Response(JSON.stringify(payload), { status: 200 });
      }
      return new Response(JSON.stringify([{
        id: 'evt1',
        sport_key: 'soccer_test',
        sport_title: 'Test Soccer',
        commence_time: '2026-09-18T12:00:00Z',
        home_team: 'Home FC',
        away_team: 'Away FC',
        bookmakers: [{
          key: 'book1',
          title: 'Book One',
          last_update: '2026-09-18T11:59:00Z',
          markets: [{
            key: 'h2h',
            last_update: '2026-09-18T11:59:00Z',
            outcomes: [{ name: 'Home FC', price: 2 }, { name: 'Away FC', price: 1.8 }],
          }],
        }],
      }]), { status: 200, headers: { 'x-requests-remaining': '99' } });
    }));
    const res = response();
    await handler({ method: 'GET', query: { date: '2026-09-18', sport: 'soccer' } }, res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).events).toHaveLength(1);
    expect((res.body as any).snapshots).toHaveLength(1);
    expect((res.body as any).providerHealth.state).toBe('HEALTHY');
    expect((res.body as any).providerHealth.ageSeconds).toBeLessThan(120);
  });

  it('marks old provider quotes as stale instead of healthy', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-18T12:30:00Z'));
    vi.stubEnv('PARLAY_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/sports/?')) return new Response(JSON.stringify([{ key: 'soccer_test', group: 'soccer', title: 'Test Soccer', active: true, has_outrights: false }]), { status: 200 });
      return new Response(JSON.stringify([{
        id: 'evt-stale', sport_key: 'soccer_test', sport_title: 'Test Soccer', commence_time: '2026-09-18T12:20:00Z',
        home_team: 'Home FC', away_team: 'Away FC', bookmakers: [{ key: 'book1', title: 'Book One', last_update: '2026-09-18T12:00:00Z', markets: [{ key: 'h2h', last_update: '2026-09-18T12:00:00Z', outcomes: [{ name: 'Home FC', price: 2 }, { name: 'Away FC', price: 1.8 }] }] }],
      }]), { status: 200 });
    }));
    const res = response();
    await handler({ method: 'GET', query: { date: '2026-09-18', sport: 'soccer' } }, res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).providerHealth.state).toBe('STALE');
    expect((res.body as any).providerHealth.ageSeconds).toBeGreaterThan(600);
    expect((res.body as any).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'stale-odds', severity: 'warning' })]));
  });
});
