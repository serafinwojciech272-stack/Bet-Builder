import type { DemoOddsSnapshot, Market, Selection } from '../domain/types';
import { impliedProbability, modelEv, valueOver, riskForOdds } from '../analytics/calcs';

// Deterministic demo data factory. Stable across reloads for demo consistency.
function stableRand(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}

export function buildSelection(id: string, marketId: string, eventId: string, name: string, shortName: string, odds: number, opts?: { line?: number; correlationGroup?: string; seed?: string }): Selection {
  const seed = opts?.seed ?? id;
  const implied = impliedProbability(odds);
  const offset = (stableRand(seed + 'p') - 0.42) * 0.12;
  const probability = Math.min(0.95, Math.max(0.05, implied + offset));
  const value = valueOver(probability, odds);
  const ev = modelEv(probability, odds);
  const confidence = 0.55 + stableRand(seed + 'c') * 0.35;
  const risk = riskForOdds(odds);
  const correlationGroup = opts?.correlationGroup ?? `grp-${eventId}-${marketId}`;
  return { id, marketId, eventId, name, shortName, line: opts?.line, odds, probability, impliedProbability: implied, value, ev, confidence, risk, correlationGroup };
}

const NOW = Date.now();
function iso(msAgo: number): string { return new Date(NOW - msAgo).toISOString(); }

export function buildOddsHistory(selectionId: string, currentOdds: number): DemoOddsSnapshot[] {
  const open = Math.max(1.05, currentOdds + (stableRand(selectionId + 'o') - 0.5) * 0.3);
  const snaps: DemoOddsSnapshot[] = [];
  for (let i = 0; i < 5; i++) {
    const frac = i / 4;
    const odds = open + (currentOdds - open) * frac;
    snaps.push({ id: `${selectionId}-snap-${i}`, selectionId, odds: Math.round(odds * 100) / 100, timestamp: iso((4 - i) * 3600_000), provider: 'DEMO-ODDS', sourceQuality: 'HIGH' });
  }
  return snaps;
}

export interface DemoMarketSpec {
  market: { type: string; name: string; category: string };
  selections: { name: string; shortName: string; odds: number; line?: number; correlationGroup?: string }[];
}

export function buildMarketsForEvent(eventId: string, specs: DemoMarketSpec[]): { markets: Market[]; selections: Selection[]; histories: Record<string, DemoOddsSnapshot[]> } {
  const markets: Market[] = [];
  const selections: Selection[] = [];
  const histories: Record<string, DemoOddsSnapshot[]> = {};
  for (const spec of specs) {
    const marketId = `${eventId}-${spec.market.type.replace(/\s+/g, '').toLowerCase()}`;
    markets.push({ id: marketId, eventId, type: spec.market.type, name: spec.market.name, category: spec.market.category, status: 'OPEN' });
    for (const s of spec.selections) {
      const selId = `${marketId}-${s.shortName.replace(/\s+/g, '').toLowerCase()}`;
      const selection = buildSelection(selId, marketId, eventId, s.name, s.shortName, s.odds, { line: s.line, correlationGroup: s.correlationGroup, seed: selId });
      selections.push(selection);
      histories[selId] = buildOddsHistory(selId, s.odds);
    }
  }
  return { markets, selections, histories };
}
