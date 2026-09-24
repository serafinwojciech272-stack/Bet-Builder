import { describe, expect, it } from 'vitest';
import { riskAlerts } from '../state/selectors';
import type { EventIntel } from '../state/selectors';
import type { RiskFactorCalc } from '../domain/services/riskService';
import { det } from '../domain/numbers';
import type { SportEvent } from '../domain/types';

/**
 * Regression guard for the historical `undefined.weight` runtime crash.
 *
 * The failure mode was an unguarded `weight.value` lookup on a risk/config object
 * that a live provider had not populated. Event-only providers (SportScore,
 * TheSportsDB) legitimately surface events without the full deterministic payload,
 * so every weight/scoring access on the analysis path must degrade to a default
 * rather than throw.
 */

function event(id: string): SportEvent {
  return {
    id,
    sportKey: 'soccer',
    league: { id: 'l1', name: 'Test League', sportKey: 'soccer', country: 'PL' },
    homeTeam: { id: 'h', name: 'Home FC', shortName: 'Home', rating: 0.5, form: [], injuriesOut: 0 },
    awayTeam: { id: 'a', name: 'Away FC', shortName: 'Away', rating: 0.5, form: [], injuriesOut: 0 },
    startTime: '2026-09-24T15:00:00.000Z',
    status: 'scheduled',
    venue: '',
    monitored: true,
    liquidity: 0.5,
  };
}

function intelWithFactors(factors: RiskFactorCalc[]): EventIntel {
  return {
    event: event('thesportsdb:2269515'),
    market: 'match-winner',
    movement: null,
    quality: { grade: 'C', score: det(0.5, 'ratio', 'data-quality-service') } as EventIntel['quality'],
    model: { probabilities: [] } as unknown as EventIntel['model'],
    value: {} as EventIntel['value'],
    risk: {
      eventId: 'thesportsdb:2269515',
      level: 'HIGH',
      score: det(0.7, 'ratio', 'risk-service'),
      factors,
      exposureCeilingPct: det(1, 'ratio', 'risk-service'),
      timeToStartMinutes: det(60, 'minutes', 'risk-service'),
      computedAt: '2026-09-24T14:00:00.000Z',
    },
  };
}

describe('weight regression hardenings', () => {
  it('does not throw when a risk factor carries an undefined weight', () => {
    const malformed = [{ id: 'x', label: 'Malformed', note: 'no weight attached' } as unknown as RiskFactorCalc];
    expect(() => riskAlerts([intelWithFactors(malformed)])).not.toThrow();
    expect(riskAlerts([intelWithFactors(malformed)])[0].message).toContain('no weight attached');
  });

  it('does not throw when the score object itself is undefined', () => {
    const malformed = [{ id: 'y', label: 'Half built', note: 'score missing' } as unknown as RiskFactorCalc];
    const rows = riskAlerts([intelWithFactors(malformed)]);
    expect(rows).toHaveLength(1);
    expect(Number.isFinite(rows[0] ? 0 : NaN)).toBe(true);
  });

  it('does not throw when the risk factors collection is empty', () => {
    expect(() => riskAlerts([intelWithFactors([])])).not.toThrow();
    expect(riskAlerts([intelWithFactors([])])[0].message).toContain('Risk factors unavailable');
  });

  it('never surfaces "Cannot read properties of undefined" on a sparse payload', () => {
    const sparse = [] as RiskFactorCalc[];
    const rows = riskAlerts([intelWithFactors(sparse)]);
    expect(rows.some((r) => r.message.includes('Cannot read properties of undefined'))).toBe(false);
  });
});
