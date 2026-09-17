import { impliedProbability, modelEv, riskForOdds, valueOver } from '../analytics/calcs';
import type { CanonicalDataset } from '../domain/repositories';
import type { EventWithMarkets, Market, Selection, SportEvent } from '../domain/types';

export function liveEvents(dataset: CanonicalDataset): EventWithMarkets[] {
  return dataset.events.map((event) => eventToLegacy(event, dataset));
}

export function liveEvent(dataset: CanonicalDataset, eventId: string): EventWithMarkets | undefined {
  const event = dataset.events.find((item) => item.id === eventId);
  return event ? eventToLegacy(event, dataset) : undefined;
}

function quoteKey(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ');
}

function consensusForQuotes(snapshots: CanonicalDataset['snapshots']): Map<string, number> {
  const sums = new Map<string, number>();
  const counts = new Map<string, number>();
  const marketBooks = new Set(snapshots.map((snapshot) => snapshot.bookmaker));

  for (const snapshot of snapshots) {
    const raw = snapshot.quotes.map((quote) => ({ key: quoteKey(quote.label), p: impliedProbability(quote.decimalOdds) }));
    const total = raw.reduce((sum, item) => sum + item.p, 0);
    if (total <= 0) continue;
    for (const item of raw) {
      const normalized = item.p / total;
      sums.set(item.key, (sums.get(item.key) ?? 0) + normalized);
      counts.set(item.key, (counts.get(item.key) ?? 0) + 1);
    }
  }

  const result = new Map<string, number>();
  for (const [key, sum] of sums) {
    const count = counts.get(key) ?? 1;
    const coverage = Math.min(1, count / Math.max(1, marketBooks.size));
    result.set(key, sum / count * (0.92 + coverage * 0.08));
  }
  return result;
}

function eventToLegacy(event: SportEvent, dataset: CanonicalDataset): EventWithMarkets {
  const snapshots = dataset.snapshots.filter((s) => s.eventId === event.id);
  const markets: Array<Market & { selections: Selection[] }> = [];
  const groups = new Map<string, typeof snapshots>();

  for (const snapshot of snapshots) {
    const key = `${snapshot.market}:${snapshot.bookmaker}`;
    const arr = groups.get(key) ?? [];
    arr.push(snapshot);
    groups.set(key, arr);
  }

  for (const [key, group] of groups) {
    const [marketType, bookmaker] = key.split(':');
    const snapshot = [...group].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
    const marketSnapshots = snapshots.filter((s) => s.market === snapshot.market);
    const consensus = consensusForQuotes(marketSnapshots);
    const marketId = `${event.id}:${key}`;
    const market: Market & { selections: Selection[] } = {
      id: marketId,
      eventId: event.id,
      type: marketType,
      name: `${marketLabel(marketType)} · ${bookmaker}`,
      category: bookmaker,
      status: 'OPEN',
      selections: snapshot.quotes.map((quote) => {
        const implied = impliedProbability(quote.decimalOdds);
        const probability = consensus.get(quoteKey(quote.label)) ?? implied;
        const coverage = new Set(marketSnapshots.map((s) => s.bookmaker)).size;
        return {
          id: quote.selectionId,
          marketId,
          eventId: event.id,
          name: quote.label,
          shortName: quote.label,
          line: undefined,
          odds: quote.decimalOdds,
          probability,
          impliedProbability: implied,
          value: valueOver(probability, quote.decimalOdds),
          ev: modelEv(probability, quote.decimalOdds),
          confidence: Math.min(0.95, 0.5 + coverage * 0.07),
          risk: riskForOdds(quote.decimalOdds),
          correlationGroup: `${event.id}:${marketType}`,
        };
      }),
    };
    markets.push(market);
  }

  return {
    id: event.id,
    sport: event.sportKey,
    league: event.league.name,
    competition: event.league.name,
    homeTeam: event.homeTeam.name,
    awayTeam: event.awayTeam.name,
    startTime: event.startTime,
    status: event.status === 'live' ? 'LIVE' : event.status === 'final' ? 'FINISHED' : 'SCHEDULED',
    markets,
  };
}

function marketLabel(type: string): string {
  if (type === 'match-winner') return 'Match Winner';
  if (type === 'spread') return 'Spread / Handicap';
  if (type === 'totals') return 'Totals O/U';
  if (type === 'both-teams-to-score') return 'Both Teams To Score';
  return type;
}
