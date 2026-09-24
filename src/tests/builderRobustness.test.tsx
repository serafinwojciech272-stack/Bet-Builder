// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { isAdmissibleSelection, sanitizeSelections, useBuilder } from '../hooks/useBuilder';
import { computeBuilderStats } from '../hooks/useBuilderStats';
import { liveEvents } from '../services/liveAdapter';
import { evaluateDecisionCenter } from '../core/decisionCenter';
import { createDecisionPacket } from '../core/decisionPacket';
import type { CanonicalDataset } from '../domain/repositories';
import type { Selection } from '../domain/types';

declare global { var IS_REACT_ACT_ENVIRONMENT: boolean | undefined; }
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Regression guard for the Builder stage.
 *
 * The builder must only ever admit selections that carry legitimate market inputs
 * (finite odds, valid probability). Present production data has no bookmaker odds,
 * so the builder must produce explicit non-buildable records instead of fabricating
 * a slip, odds, stake, EV or confidence.
 */

function selection(over: Partial<Selection> = {}): Selection {
  return {
    id: 'S1', marketId: 'match-winner', eventId: 'E1', name: 'Home', shortName: 'Home',
    odds: 2.2, probability: 0.5, impliedProbability: 1 / 2.2, value: 0.045, ev: 0.1,
    confidence: 0.85, risk: 'LOW', correlationGroup: 'E1', ...over,
  };
}

function dataset(events: number, withOdds: boolean): CanonicalDataset {
  return {
    events: Array.from({ length: events }, (_, i) => ({
      id: `thesportsdb:${1000 + i}`, sportKey: i % 2 ? 'cricket' : 'basketball',
      league: { id: `l${i}`, name: `League ${i}`, sportKey: 'soccer', country: 'PL' },
      homeTeam: { id: `h${i}`, name: `Home ${i}`, shortName: `H${i}`, rating: 0.5, form: [], injuriesOut: 0 },
      awayTeam: { id: `a${i}`, name: `Away ${i}`, shortName: `A${i}`, rating: 0.5, form: [], injuriesOut: 0 },
      startTime: '2026-09-24T18:00:00.000Z', status: 'scheduled' as const, venue: 'V', monitored: true, liquidity: 0.5,
    })),
    snapshots: withOdds
      ? [{ id: 's1', eventId: 'thesportsdb:1000', market: 'match-winner', bookmaker: 'book', capturedAt: '2026-09-24T12:00:00.000Z', quotes: [{ selectionId: 'q1', label: 'Home 0', decimalOdds: 2.1 }, { selectionId: 'q2', label: 'Away 0', decimalOdds: 1.9 }], feedLatencyMs: 60_000, provider: 'test' }]
      : [],
    issues: [], droppedRecords: 0, normalizedAt: '2026-09-24T12:00:00.000Z', provider: 'thesportsdb', mode: withOdds ? 'LIVE' : 'LIVE_DATA_NO_ODDS',
  };
}

describe('builder input boundary', () => {
  it('rejects selections without legitimate market inputs', () => {
    expect(isAdmissibleSelection(selection({ odds: NaN }))).toBe(false);
    expect(isAdmissibleSelection(selection({ odds: Infinity }))).toBe(false);
    expect(isAdmissibleSelection(selection({ odds: 1 }))).toBe(false);
    expect(isAdmissibleSelection(selection({ odds: 0.8 }))).toBe(false);
    expect(isAdmissibleSelection(selection({ probability: NaN }))).toBe(false);
    expect(isAdmissibleSelection(selection({ probability: 1.5 }))).toBe(false);
    expect(isAdmissibleSelection(selection({ probability: -0.1 }))).toBe(false);
    expect(isAdmissibleSelection(selection())).toBe(true);
  });

  it('drops invalid and duplicate selections from an external store', () => {
    const sanitized = sanitizeSelections([
      selection({ id: 'nan', odds: NaN }),
      selection({ id: 'inf', odds: Infinity }),
      selection({ id: 'ok' }),
      selection({ id: 'ok' }),
    ]);
    expect(sanitized.map((s) => s.id)).toEqual(['ok']);
  });

  it('keeps the slip free of NaN/undefined and rejects invalid additions', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    let api: ReturnType<typeof useBuilder> | null = null;
    function Probe() { api = useBuilder(); return null; }
    await act(async () => { root.render(<Probe />); });
    await act(async () => {
      api!.add(selection({ id: 'bad', odds: NaN }));
      api!.add(selection({ id: 'good' }));
      api!.replace([selection({ id: 'rep', odds: Infinity }), selection({ id: 'good' })]);
    });
    expect(api!.selections.map((s) => s.id)).toEqual(['good']);
    expect(api!.selections.every((s) => Number.isFinite(s.odds) && Number.isFinite(s.probability))).toBe(true);
    root.unmount();
  });
});

describe('builder numeric outputs stay finite', () => {
  it('never emits NaN/Infinity for non-finite odds', () => {
    const stats = computeBuilderStats([
      selection({ id: 'a', odds: NaN }),
      selection({ id: 'b', odds: Infinity }),
      selection({ id: 'c' }),
    ], 25);
    for (const value of [stats.multi, stats.ret, stats.profit, stats.ev, stats.estProb]) expect(Number.isFinite(value)).toBe(true);
  });

  it('reports an empty slip as zero-valued (no fabricated payout)', () => {
    const stats = computeBuilderStats([], 25);
    expect(stats.multi).toBe(0);
    expect(stats.ret).toBe(0);
    expect(stats.profit).toBe(0);
    expect(stats.ev).toBe(0);
  });

  it('still builds a legitimate DATA_SUPPORTED slip', () => {
    const stats = computeBuilderStats([selection()], 25);
    expect(stats.multi).toBeCloseTo(2.2, 8);
    expect(stats.ret).toBeCloseTo(55, 8);
    expect(Number.isFinite(stats.ev)).toBe(true);
  });
});

describe('builder reconciliation with absent market data', () => {
  it('maps 18 optimizer inputs to 18 explicit non-buildable builder records', () => {
    const projection = liveEvents(dataset(18, false));
    expect(projection).toHaveLength(18);
    const records = projection.map((event) => {
      const buildable = event.markets.flatMap((m) => m.selections).filter(isAdmissibleSelection);
      return { eventId: event.id, buildable: buildable.length, state: buildable.length ? 'BUILDABLE' : 'NO_BUILDABLE_SELECTIONS' };
    });
    expect(records).toHaveLength(18);
    expect(records.every((r) => r.eventId.startsWith('thesportsdb:'))).toBe(true);
    expect(records.every((r) => r.state === 'NO_BUILDABLE_SELECTIONS')).toBe(true);
    expect(records.every((r) => r.buildable === 0)).toBe(true);
  });

  it('does not fabricate selections when only events (no snapshots) exist', () => {
    const projection = liveEvents(dataset(3, false));
    expect(projection.reduce((n, e) => n + e.markets.length, 0)).toBe(0);
  });

  it('keeps a BLOCKED optimizer from producing a buildable bet', () => {
    const decision = evaluateDecisionCenter([]);
    const packet = createDecisionPacket(decision, [], null, new Date('2026-09-24T00:00:00.000Z'));
    expect(packet.mission.eligible).toBe(false);
    expect(computeBuilderStats([], 25).multi).toBe(0);
  });

  it('keeps the DATA_SUPPORTED builder path buildable', () => {
    const projection = liveEvents(dataset(1, true));
    const buildable = projection[0].markets.flatMap((m) => m.selections).filter(isAdmissibleSelection);
    expect(buildable.length).toBeGreaterThan(0);
    expect(computeBuilderStats(buildable, 25).multi).toBeGreaterThan(1);
  });
});
