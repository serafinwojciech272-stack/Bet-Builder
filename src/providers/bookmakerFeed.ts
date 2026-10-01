import type { CanonicalDataset } from '../domain/repositories.js';

export type BookmakerFeedRequest = { date: string; sport: string; bookmakers: string[] };

export interface BookmakerFeedProvider {
  readonly id: string;
  readonly capabilities: readonly string[];
  isConfigured(): boolean;
  fetch(request: BookmakerFeedRequest): Promise<CanonicalDataset>;
}

export function selectBookmakerFeedProvider(
  providers: readonly BookmakerFeedProvider[],
  request: BookmakerFeedRequest,
): BookmakerFeedProvider | null {
  const requested = request.bookmakers.map(v => v.trim().toLowerCase()).filter(Boolean);
  return providers.find(p =>
    p.isConfigured() &&
    p.capabilities.some(c => requested.includes(c.toLowerCase())),
  ) ?? null;
}
