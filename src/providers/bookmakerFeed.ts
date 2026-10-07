import type { CanonicalDataset } from '../domain/repositories.js';
import type { ProviderHealth } from '../domain/types.js';

export type BookmakerFeedRequest = { date: string; sport: string; bookmakers: string[] };

export interface BookmakerFeedProvider {
  readonly id: string;
  readonly capabilities: readonly string[];
  isConfigured(): boolean;
  fetch(request: BookmakerFeedRequest): Promise<CanonicalDataset>;
}

export type BookmakerProviderResolution = {
  bookmaker: string;
  provider: BookmakerFeedProvider | null;
};

export function resolveBookmakerProviders(
  providers: readonly BookmakerFeedProvider[],
  request: BookmakerFeedRequest,
): BookmakerProviderResolution[] {
  const requested = [...new Set(request.bookmakers.map(v => v.trim()).filter(Boolean))];
  return requested.map(bookmaker => ({
    bookmaker,
    provider: providers.find(p =>
      p.isConfigured() &&
      p.capabilities.some(c => c.toLowerCase() === bookmaker.toLowerCase()),
    ) ?? null,
  }));
}

export function selectBookmakerFeedProvider(
  providers: readonly BookmakerFeedProvider[],
  request: BookmakerFeedRequest,
): BookmakerFeedProvider | null {
  return resolveBookmakerProviders(providers, request).find(r => r.provider)?.provider ?? null;
}


function mergeProviderHealth(datasets: readonly CanonicalDataset[]): ProviderHealth | undefined {
  const health = datasets.map(d => d.providerHealth).filter((value): value is NonNullable<typeof value> => Boolean(value));
  if (!health.length) return undefined;
  const states = new Set(health.map(h => h.state));
  const state = states.has('OFFLINE') ? 'OFFLINE' : states.has('STALE') ? 'STALE' : states.has('DEGRADED') ? 'DEGRADED' : 'HEALTHY';
  return {
    ...health[0],
    provider: datasets.length === 1 ? health[0].provider : 'multi-provider',
    state,
    fetchedAt: health.map(h => h.fetchedAt).sort()[health.length - 1] ?? health[0].fetchedAt,
    ageSeconds: Math.max(...health.map(h => h.ageSeconds)),
    queriedSports: Math.max(...health.map(h => h.queriedSports)),
    successfulSports: health.reduce((sum, h) => sum + h.successfulSports, 0),
    failedSports: health.reduce((sum, h) => sum + h.failedSports, 0),
    eventCount: new Set(datasets.flatMap(d => d.events.map(e => e.id))).size,
    snapshotCount: new Set(datasets.flatMap(d => d.snapshots.map(s => s.id))).size,
    bookmakerCount: new Set(datasets.flatMap(d => d.bookmakers ?? [])).size,
    warnings: [...new Set(health.flatMap(h => h.warnings))].slice(0, 10),
  };
}

export function mergeBookmakerDatasets(
  datasets: readonly CanonicalDataset[],
  requestedBookmakers: readonly string[],
): CanonicalDataset {
  const events = [...new Map(datasets.flatMap(d => d.events).map(event => [event.id, event])).values()];
  const snapshots = [...new Map(datasets.flatMap(d => d.snapshots).map(snapshot => [snapshot.id, snapshot])).values()];
  const issues = datasets.flatMap(d => d.issues);
  const bookmakers = [...new Set(datasets.flatMap(d => d.bookmakers ?? []))];
  const first = datasets[0];
  return {
    events, snapshots, issues,
    droppedRecords: datasets.reduce((sum, d) => sum + d.droppedRecords, 0),
    normalizedAt: new Date().toISOString(),
    provider: datasets.length === 1 ? first?.provider : undefined,
    mode: snapshots.length ? 'LIVE' : first?.mode,
    requestedDate: first?.requestedDate,
    sportsQueried: [...new Set(datasets.flatMap(d => d.sportsQueried ?? []))],
    bookmakers: requestedBookmakers.filter(requested => bookmakers.some(found => found.toLowerCase() === requested.toLowerCase())),
    availableSports: datasets.flatMap(d => d.availableSports ?? []).filter((item, index, all) =>
      all.findIndex(candidate => candidate.key === item.key) === index),
    providerHealth: mergeProviderHealth(datasets),
  };
}
