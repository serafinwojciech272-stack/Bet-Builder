import type { CanonicalDataset } from '../domain/repositories.js';

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
    provider: first?.provider,
    mode: snapshots.length ? 'LIVE' : first?.mode,
    requestedDate: first?.requestedDate,
    sportsQueried: [...new Set(datasets.flatMap(d => d.sportsQueried ?? []))],
    bookmakers: requestedBookmakers.filter(requested => bookmakers.some(found => found.toLowerCase() === requested.toLowerCase())),
    availableSports: datasets.flatMap(d => d.availableSports ?? []).filter((item, index, all) =>
      all.findIndex(candidate => candidate.key === item.key) === index),
    providerHealth: first?.providerHealth,
  };
}
