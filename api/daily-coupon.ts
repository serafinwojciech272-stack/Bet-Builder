import { buildDailyCoupon } from '../src/core/dailyCoupon.js';
import type { CanonicalDataset } from '../src/domain/repositories.js';

type QueryRequest = { method?: string; query?: Record<string, string | undefined> };
type JsonResponse = { status: (code: number) => JsonResponse; setHeader: (name: string, value: string) => JsonResponse; end: (body: string) => void };

function json(res: JsonResponse, status: number, body: unknown) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').setHeader('Cache-Control', 'no-store').end(JSON.stringify(body));
}

function todayWarsaw() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function numberQuery(req: QueryRequest, key: string, fallback: number) {
  const value = Number(req.query?.[key] ?? '');
  return Number.isFinite(value) ? value : fallback;
}

export default async function handler(req: QueryRequest, res: JsonResponse) {
  if (req.method !== 'GET') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  const date = req.query?.date ?? todayWarsaw();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { error: 'INVALID_DATE', message: 'Use date=YYYY-MM-DD.' });

  const bookmakers = (req.query?.bookmakers ?? 'STS,Superbet').split(',').map(v => v.trim()).filter(Boolean).slice(0, 4);
  const stake = Math.max(0, numberQuery(req, 'stake', 20));
  const maxLegs = Math.max(1, Math.min(12, Math.round(numberQuery(req, 'maxLegs', 5))));
  const sport = req.query?.sport ?? 'all';
  const port = Number(process.env.PORT ?? 10000);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/odds?date=${encodeURIComponent(date)}&sport=${encodeURIComponent(sport)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    const raw = await response.text();
    let dataset: CanonicalDataset;
    try { dataset = JSON.parse(raw) as CanonicalDataset; } catch { return json(res, 502, { error: 'ODDS_INVALID_JSON', sourceStatus: 'UNAVAILABLE' }); }
    if (!response.ok) return json(res, response.status, { error: 'ODDS_PROVIDER_UNAVAILABLE', sourceStatus: 'UNAVAILABLE', dataset });
    const result = buildDailyCoupon({
      date,
      events: dataset.events,
      snapshots: dataset.snapshots,
      bookmakers,
      stake,
      maxLegs,
      minOdds: 1.25,
      maxOdds: 4.5,
      providerHealth: dataset.providerHealth ? {
        provider: dataset.providerHealth.provider,
        state: dataset.providerHealth.state,
        ageSeconds: dataset.providerHealth.ageSeconds,
        staleAfterSeconds: dataset.providerHealth.staleAfterSeconds,
        snapshotCount: dataset.providerHealth.snapshotCount,
        bookmakerCount: dataset.providerHealth.bookmakerCount,
      } : undefined,
    });
    return json(res, 200, {
      ...result,
      generatedAt: new Date().toISOString(),
      source: { provider: dataset.provider, mode: dataset.mode, bookmakersAvailable: dataset.bookmakers ?? [], providerHealth: dataset.providerHealth ?? null },
      execution: 'READ_ONLY_COUPON_GENERATION',
    });
  } catch (error) {
    return json(res, 502, { error: 'DAILY_COUPON_SOURCE_ERROR', sourceStatus: 'UNAVAILABLE', message: error instanceof Error ? error.message : 'unknown error' });
  }
}
