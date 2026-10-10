import { describe, expect, it } from 'vitest';
import { rivalIdentities, teamIdentity, teamInitials } from '../lib/teamIdentity';
import { matchOfTheDay, shares, toMatchRow } from '../lib/matchBoard';
import type { EventWithMarkets, Selection } from '../domain/types';

const sel = (id: string, eventId: string, name: string, odds: number, probability: number, book: string): Selection => ({
  id, marketId: `${eventId}:${book}`, eventId, name, shortName: name, odds, probability, impliedProbability: 1 / odds,
  value: 0, ev: probability * odds - 1, confidence: 0.7, risk: 'LOW', correlationGroup: eventId, dataFreshness: 1, bookmakerDepth: 2,
});
const event = (id: string, home: string, away: string, ph: number, pa: number, start = '2026-10-10T18:00:00Z'): EventWithMarkets => ({
  id, sport: 'soccer', league: 'L', competition: 'L', homeTeam: home, awayTeam: away, startTime: start, status: 'SCHEDULED',
  markets: ['STS', 'Superbet'].map((b, j) => ({
    id: `${id}:${b}`, eventId: id, type: 'match-winner', name: 'W', category: b, status: 'OPEN' as const,
    selections: [sel(`${id}:h`, id, home, +(0.95 / ph + j * 0.05).toFixed(2), ph, b), sel(`${id}:d`, id, 'Draw', 3.4, 1 - ph - pa, b), sel(`${id}:a`, id, away, +(0.95 / pa).toFixed(2), pa, b)],
  })),
});

describe('team identity', () => {
  it('is deterministic and builds readable initials', () => {
    expect(teamIdentity('Legia Warszawa')).toEqual(teamIdentity('Legia Warszawa'));
    expect(teamInitials('FC Barcelona')).toBe('BAR');
    expect(teamInitials('Manchester United')).toBe('MU');
  });
  it('keeps rivals visually distinct', () => {
    for (const [h, a] of [['Arsenal', 'Chelsea'], ['Lech Poznań', 'Legia Warszawa'], ['A', 'B'], ['Inter', 'Milan']]) {
      const [x, y] = rivalIdentities(h, a);
      const d = Math.abs(((x.hue - y.hue + 540) % 360) - 180);
      expect(d).toBeGreaterThanOrEqual(110);
    }
  });
});

describe('match board', () => {
  it('maps 1/X/2, keeps every bookmaker quote and the best price', () => {
    const row = toMatchRow(event('e1', 'Home', 'Away', 0.45, 0.3))!;
    expect(row.outcomes.map((o) => o.key)).toEqual(['1', 'X', '2']);
    expect(row.quotes['1']).toHaveLength(2);
    expect(row.outcomes[0].odds).toBe(row.quotes['1'][0].odds);
    const s = shares(row);
    expect(s['1'] + s.X + s['2']).toBeCloseTo(1, 6);
  });
  it('picks the most balanced upcoming match as match of the day', () => {
    const rows = [event('a', 'A', 'B', 0.7, 0.1), event('b', 'C', 'D', 0.38, 0.36), event('c', 'E', 'F', 0.55, 0.2)].map((e) => toMatchRow(e)!);
    expect(matchOfTheDay(rows, Date.parse('2026-10-10T10:00:00Z'))?.event.id).toBe('b');
  });
});
