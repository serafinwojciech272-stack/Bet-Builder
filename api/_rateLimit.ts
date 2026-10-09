// Fixed-window, in-memory rate limiter for public, cost-bearing endpoints
// (AI gateway, paid odds providers, news research).
//
// Scope: per process. On Render (single instance) this is effective; on
// Vercel serverless it is best-effort per warm instance. A shared store
// (Upstash/Redis) is the follow-up once user auth exists — see docs/AUDIT.
//
// Files prefixed with "_" are not deployed as Vercel functions.

type Headers = Record<string, string | string[] | undefined> | undefined;

interface Window { count: number; resetAt: number }

const buckets = new Map<string, Window>();
const MAX_KEYS = 10_000;
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function header(headers: Headers, name: string): string {
  const raw = headers?.[name] ?? headers?.[name.toLowerCase()];
  return (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';
}

/**
 * Client identity, best effort. The API sits behind Render's proxy and, for the
 * Vercel frontend, behind a Vercel rewrite as well, so the right-most
 * X-Forwarded-For hop is a shared proxy address, not the user. The left-most
 * entry is the original client but can be spoofed; that only lets an attacker
 * dodge the per-client limit, which the per-bucket global cap below still bounds.
 */
export function clientKey(headers: Headers): string {
  const vercel = header(headers, 'x-vercel-forwarded-for');
  if (vercel) return vercel.split(',')[0].trim();
  const xff = header(headers, 'x-forwarded-for');
  if (xff) {
    const first = xff.split(',').map((p) => p.trim()).find(Boolean);
    if (first) return first;
  }
  return header(headers, 'x-remote-address') || 'unknown';
}

/** Upper bound per bucket per process, regardless of client identity. */
const GLOBAL_MULTIPLIER = 10;

function hit(key: string, limit: number, windowMs: number, now: number): RateLimitResult {
  let window = buckets.get(key);
  if (!window || window.resetAt <= now) {
    if (buckets.size >= MAX_KEYS) {
      for (const [k, w] of buckets) if (w.resetAt <= now) buckets.delete(k);
      if (buckets.size >= MAX_KEYS) buckets.clear();
    }
    window = { count: 0, resetAt: now + windowMs };
    buckets.set(key, window);
  }
  window.count += 1;
  const allowed = window.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - window.count),
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
  };
}

export interface RateLimitResult { allowed: boolean; remaining: number; retryAfterSeconds: number }

export function checkRateLimit(bucket: string, headers: Headers, limit: number, windowMs = 60_000, now = Date.now()): RateLimitResult {
  const ip = clientKey(headers);
  // Internal loopback calls (daily-coupon -> /api/odds on the same host).
  if (LOOPBACK.has(ip)) return { allowed: true, remaining: limit, retryAfterSeconds: 0 };

  const global = hit(bucket + '|*', limit * GLOBAL_MULTIPLIER, windowMs, now);
  if (!global.allowed) return global;
  return hit(bucket + '|' + ip, limit, windowMs, now);
}

interface LimitedResponse {
  status: (code: number) => LimitedResponse;
  setHeader: (name: string, value: string) => LimitedResponse;
  end: (body: string) => void;
}

/** Returns true when the request was rejected (response already sent). */
export function rejectIfRateLimited(bucket: string, req: { headers?: Headers }, res: LimitedResponse, limit: number, windowMs = 60_000): boolean {
  const result = checkRateLimit(bucket, req.headers, limit, windowMs);
  if (result.allowed) return false;
  res
    .status(429)
    .setHeader('Content-Type', 'application/json; charset=utf-8')
    .setHeader('Cache-Control', 'no-store')
    .setHeader('Retry-After', String(result.retryAfterSeconds));
  res.end(JSON.stringify({ error: 'RATE_LIMITED', retryAfterSeconds: result.retryAfterSeconds }));
  return true;
}

export function __resetRateLimitsForTests(): void {
  buckets.clear();
}
