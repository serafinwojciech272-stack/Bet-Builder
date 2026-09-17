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
    const marketId = `${event.id}:${key}`;
    const market: Market & { selections: Selection[] } = {
      id: marketId,
      eventId: event.id,
      type: marketType,
      name: `${marketLabel(marketType)} · ${bookmaker}`,
      category: bookmaker,
      status: 'OPEN',
      selections: snapshot.quotes.map((quote) => {
        const p = impliedProbability(quote.decimalOdds);
        return {
          id: quote.selectionId,
          marketId,
          eventId: event.id,
          name: quote.label,
          shortName: quote.label,
          line: undefined,
          odds: quote.decimalOdds,
          probability: p,
          impliedProbability: p,
          value: valueOver(p, quote.decimalOdds),
          ev: modelEv(p, quote.decimalOdds),
          confidence: 0.5,
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
  return type;
}
