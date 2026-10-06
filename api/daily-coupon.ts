import { buildDailyCoupon } from '../src/core/dailyCoupon.js';
import type { CanonicalDataset } from '../src/domain/repositories.js';
import { mergeBookmakerDatasets, resolveBookmakerProviders } from '../src/providers/bookmakerFeed.js';
import { getBookmakerFeedProviders } from './bookmaker-feed-provider.js';

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

async function loadFallbackDataset(date: string, sport: string, port: number): Promise<CanonicalDataset> {
  const response = await fetch(`http://127.0.0.1:${port}/api/odds?date=${encodeURIComponent(date)}&sport=${encodeURIComponent(sport)}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  const raw = await response.text();
  let dataset: CanonicalDataset;
  try {
    dataset = JSON.parse(raw) as CanonicalDataset;
  } catch {
    throw new Error('ODDS_INVALID_JSON');
  }
  if (!response.ok) throw new Error('ODDS_PROVIDER_UNAVAILABLE');
  return dataset;
}

async function loadBookmakerDataset(date: string, sport: string, bookmakers: string[], port: number) {
  const resolutions = resolveBookmakerProviders(getBookmakerFeedProviders(), {
    date, sport, bookmakers,
  });
  const configured = resolutions.filter(r => r.provider);
  const missingBookmakers = resolutions.filter(r => !r.provider).map(r => r.bookmaker);
  if (!configured.length) {
    const fallback = await loadFallbackDataset(date, sport, port);
    return {
      dataset: fallback,
      resolutions,
      missingBookmakers,
      providerIds: [] as string[],
      realBookmakerFeed: false,
    };
  }

  const providerGroups = new Map<string, { provider: NonNullable<typeof configured[number]['provider']>; bookmakers: string[] }>();
  for (const resolution of configured) {
    const provider = resolution.provider!;
    const existing = providerGroups.get(provider.id);
    if (existing) existing.bookmakers.push(resolution.bookmaker);
    else providerGroups.set(provider.id, { provider, bookmakers: [resolution.bookmaker] });
  }

  const datasets = await Promise.all([...providerGroups.values()].map(group =>
    group.provider.fetch({ date, sport, bookmakers: group.bookmakers }),
  ));
  const dataset = mergeBookmakerDatasets(datasets, bookmakers);
  return {
    dataset,
    resolutions,
    missingBookmakers,
    providerIds: [...providerGroups.keys()],
    realBookmakerFeed: true,
  };
}

export default async function handler(req: QueryRequest, res: JsonResponse) {
  if (req.method !== 'GET') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  const date = req.query?.date ?? todayWarsaw();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { error: 'INVALID_DATE', message: 'Use date=YYYY-MM-DD.' });

  const bookmakers = (req.query?.bookmakers ?? 'STS,Superbet').split(',').map(v => v.trim()).filter(Boolean).slice(0, 4);
  const stake = Math.max(0, numberQuery(req, 'stake', 20));
  const maxLegs = Math.max(1, Math.min(12, Math.round(numberQuery(req, 'maxLegs', 5))));
  const sport = req.query?.sport ?? 'all';
  const targetOdds = Math.max(0, numberQuery(req, 'targetOdds', 0));
  const minOdds = Math.max(1.01, numberQuery(req, 'minOdds', 1.25));
  const maxOdds = Math.max(minOdds, numberQuery(req, 'maxOdds', 4.5));
  const port = Number(process.env.PORT ?? 10000);

  try {
    const loaded = await loadBookmakerDataset(date, sport, bookmakers, port);
    const { dataset } = loaded;
    const result = buildDailyCoupon({
      date,
      events: dataset.events,
      snapshots: dataset.snapshots,
      bookmakers,
      stake,
      maxLegs,
      minOdds,
      maxOdds,
      targetCombinedOdds: targetOdds || undefined,
      providerHealth: dataset.providerHealth ? {
        provider: dataset.providerHealth.provider,
        state: dataset.providerHealth.state,
        ageSeconds: dataset.providerHealth.ageSeconds,
        staleAfterSeconds: dataset.providerHealth.staleAfterSeconds,
        snapshotCount: dataset.providerHealth.snapshotCount,
        bookmakerCount: dataset.providerHealth.bookmakerCount,
      } : undefined,
    });

    const missing = loaded.missingBookmakers;
    const finalResult = missing.length && loaded.realBookmakerFeed
      ? {
        ...result,
        status: 'BLOCKED' as const,
        blockers: [...result.blockers, `Brak skonfigurowanego providera dla: ${missing.join(', ')}.`],
      }
      : result;

    return json(res, 200, {
      ...finalResult,
      generatedAt: new Date().toISOString(),
      source: {
        provider: dataset.provider,
        mode: dataset.mode,
        bookmakersAvailable: dataset.bookmakers ?? [],
        providerHealth: dataset.providerHealth ?? null,
        realBookmakerFeed: loaded.realBookmakerFeed,
        providerIds: loaded.providerIds,
        resolution: loaded.resolutions.map(r => ({ bookmaker: r.bookmaker, provider: r.provider?.id ?? null })),
      },
      execution: 'READ_ONLY_COUPON_GENERATION',
    });
  } catch (error) {
    return json(res, 502, { error: 'DAILY_COUPON_SOURCE_ERROR', sourceStatus: 'UNAVAILABLE', message: error instanceof Error ? error.message : 'unknown error' });
  }
}
