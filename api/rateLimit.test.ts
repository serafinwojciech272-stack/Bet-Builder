import { beforeEach, describe, expect, it } from 'vitest';
import { __resetRateLimitsForTests, checkRateLimit, clientKey } from './_rateLimit';
import coreEngine from './core-engine';

function mockRes() {
  const out: { status?: number; body?: string; headers: Record<string, string> } = { headers: {} };
  const res = {
    status(code: number) { out.status = code; return res; },
    setHeader(name: string, value: string) { out.headers[name] = String(value); return res; },
    json(body: unknown) { out.body = JSON.stringify(body); return res; },
    end(body?: string) { out.body = body; },
  };
  return { res, out };
}

describe('rate limiter', () => {
  beforeEach(() => __resetRateLimitsForTests());

  it('uses the proxy-appended (right-most) X-Forwarded-For entry', () => {
    expect(clientKey({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9' })).toBe('203.0.113.9');
    expect(clientKey({ 'x-remote-address': '10.0.0.2' })).toBe('10.0.0.2');
  });

  it('blocks after the limit within a window and resets afterwards', () => {
    const h = { 'x-forwarded-for': '203.0.113.9' };
    for (let i = 0; i < 3; i++) expect(checkRateLimit('t', h, 3, 60_000, 1_000).allowed).toBe(true);
    const blocked = checkRateLimit('t', h, 3, 60_000, 1_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
    expect(checkRateLimit('t', h, 3, 60_000, 62_000).allowed).toBe(true);
  });

  it('never limits internal loopback calls', () => {
    for (let i = 0; i < 10; i++) expect(checkRateLimit('t', { 'x-remote-address': '127.0.0.1' }, 1).allowed).toBe(true);
  });
});

describe('core-engine gateway input validation', () => {
  beforeEach(() => __resetRateLimitsForTests());

  it('rejects unknown actions instead of forwarding them to /api/mission', async () => {
    const { res, out } = mockRes();
    await coreEngine({ method: 'POST', query: {}, headers: {}, body: { action: 'delete-everything', engineRef: 'x' } }, res);
    expect(out.status).toBe(400);
    expect(out.body).toContain('UNKNOWN_ACTION');
  });

  it('rejects malformed engine references', async () => {
    const { res, out } = mockRes();
    await coreEngine({ method: 'POST', query: {}, headers: {}, body: { action: 'execute', engineRef: '../../admin' } }, res);
    expect(out.status).toBe(400);
    expect(out.body).toContain('ENGINE_REF_INVALID');
  });

  it('caps oversized analyze tasks', async () => {
    const { res, out } = mockRes();
    await coreEngine({ method: 'POST', query: {}, headers: {}, body: { action: 'analyze', task: 'x'.repeat(5000) } }, res);
    expect(out.status).toBe(413);
  });
});
