import type { EventWithMarkets } from '../domain/types';

export type OutcomeKey = '1' | 'X' | '2';

export interface OutcomeCell {
  key: OutcomeKey;
  selectionId: string;
  label: string;
  odds: number;
  bookmaker: string;
  probability: number;
  ev: number;
  books: number;
}

export interface BookQuote { bookmaker: string; odds: number; selectionId: string }

export interface MatchRow {
  event: EventWithMarkets;
  outcomes: OutcomeCell[];
  /** Every bookmaker's price per outcome (match-winner only). */
  quotes: Record<OutcomeKey, BookQuote[]>;
  bestEv: number;
  /** 0 = one-sided, 1 = perfectly balanced home/away. */
  balance: number;
}

function keyFor(event: EventWithMarkets, name: string): OutcomeKey {
  const n = name.trim().toLowerCase();
  if (n === event.homeTeam.trim().toLowerCase()) return '1';
  if (n === event.awayTeam.trim().toLowerCase()) return '2';
  return 'X';
}

/** Best price per 1/X/2 outcome across bookmakers, plus every bookmaker's quote. */
export function toMatchRow(event: EventWithMarkets): MatchRow | null {
  const markets = event.markets.filter((m) => m.type === 'match-winner');
  if (!markets.length) return null;
  const books = new Set(markets.map((m) => m.category)).size;
  const best = new Map<OutcomeKey, OutcomeCell>();
  const quotes: Record<OutcomeKey, BookQuote[]> = { '1': [], X: [], '2': [] };
  for (const m of markets) {
    for (const s of m.selections) {
      if (!(s.odds > 1)) continue;
      const key = keyFor(event, s.name);
      const list = quotes[key];
      const existing = list.find((q) => q.bookmaker === m.category);
      if (!existing) list.push({ bookmaker: m.category, odds: s.odds, selectionId: s.id });
      else if (s.odds > existing.odds) existing.odds = s.odds;
      const cur = best.get(key);
      if (!cur || s.odds > cur.odds) {
        best.set(key, { key, selectionId: s.id, label: s.name, odds: s.odds, bookmaker: m.category, probability: s.probability, ev: s.probability * s.odds - 1, books });
      }
    }
  }
  const outcomes = (['1', 'X', '2'] as const).map((k) => best.get(k)).filter((x): x is OutcomeCell => Boolean(x));
  if (outcomes.length < 2) return null;
  for (const k of ['1', 'X', '2'] as const) quotes[k].sort((a, b) => b.odds - a.odds);
  const ph = best.get('1')?.probability ?? 0;
  const pa = best.get('2')?.probability ?? 0;
  const balance = ph + pa > 0 ? 1 - Math.abs(ph - pa) / (ph + pa) : 0;
  return { event, outcomes, quotes, bestEv: Math.max(...outcomes.map((o) => o.ev)), balance };
}

/** Normalised 1/X/2 probabilities for the tug-of-war bar. */
export function shares(row: MatchRow): Record<OutcomeKey, number> {
  const raw = { '1': 0, X: 0, '2': 0 } as Record<OutcomeKey, number>;
  for (const o of row.outcomes) raw[o.key] = o.probability;
  const total = raw['1'] + raw.X + raw['2'] || 1;
  return { '1': raw['1'] / total, X: raw.X / total, '2': raw['2'] / total };
}

/**
 * "Hit dnia": upcoming match that is most balanced and best covered by bookmakers.
 * Rivalry sells: a 50/50 game with deep markets beats a mismatch.
 */
export function matchOfTheDay(rows: MatchRow[], now: number): MatchRow | null {
  const upcoming = rows.filter((r) => r.event.status === 'LIVE' || new Date(r.event.startTime).getTime() > now - 60_000);
  if (!upcoming.length) return null;
  return [...upcoming].sort((a, b) =>
    (b.balance * 0.7 + Math.min(1, b.outcomes[0].books / 6) * 0.3) - (a.balance * 0.7 + Math.min(1, a.outcomes[0].books / 6) * 0.3),
  )[0];
}
