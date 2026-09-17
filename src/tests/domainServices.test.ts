import { describe, expect, it } from 'vitest';
import { MockSportsDataRepository } from '../domain/repositories';
import { computeMarketMovement, primaryMarketFor } from '../domain/services/movementService';
import { assessDataQuality } from '../domain/services/dataQualityService';
import { computeModelProbabilities } from '../domain/services/probabilityService';
import { computeValue } from '../domain/services/valueService';
import { computeCorrelation, computeRisk } from '../domain/services/riskService';
import { devig, expectedValue, impliedProbability, kellyFraction, overround } from '../domain/services/oddsMath';
import { measure } from '../domain/services/measurementService';

describe('deterministic odds math', () => {
  it('converts decimal odds to implied probability', () => {
    expect(impliedProbability(2)).toBeCloseTo(0.5, 6);
    expect(impliedProbability(1)).toBe(0);
  });

  it('de-vigs a market to a normalized probability set', () => {
    const quotes = [
      { selectionId: 'a', label: 'A', decimalOdds: 1.9 },
      { selectionId: 'b', label: 'B', decimalOdds: 1.9 },
    ];
    expect(overround(quotes)).toBeGreaterThan(1);
    const fair = devig(quotes);
    expect(fair.a + fair.b).toBeCloseTo(1, 6);
  });

  it('computes expected value and a capped Kelly fraction', () => {
    expect(expectedValue(0.6, 2)).toBeCloseTo(0.2, 6);
    expect(kellyFraction(0.6, 2)).toBeCloseTo(0.2, 6);
    expect(kellyFraction(0.99, 10)).toBeLessThanOrEqual(0.25);
    expect(kellyFraction(0.1, 2)).toBe(0);
  });

  it('scores measurement outcomes', () => {
    const r = measure({
      modelProbability: 0.6,
      impliedProbabilityAtAnalysis: 0.5,
      impliedProbabilityAtClose: 0.56,
      outcome: 1,
    });
    expect(r.verdict).toBe('beat-close');
    expect(r.brierScore?.value).toBeCloseTo(0.16, 6);
    const unresolved = measure({
      modelProbability: 0.4,
      impliedProbabilityAtAnalysis: 0.5,
      impliedProbabilityAtClose: 0.5,
      outcome: null,
    });
    expect(unresolved.verdict).toBe('unresolved');
    expect(unresolved.brierScore).toBeNull();
  });
});

describe('pipeline: normalization → snapshots → movement/quality → intelligence inputs', () => {
  it('normalizes the raw feed and drops unsupported records', async () => {
    const repo = new MockSportsDataRepository({ latencyMs: 0 });
    const dataset = await repo.loadCanonicalDataset();
    expect(dataset.events.length).toBeGreaterThan(5);
    expect(dataset.events.some((e) => e.sportKey === ('padel' as never))).toBe(false);
    expect(dataset.droppedRecords).toBeGreaterThan(0);
    expect(dataset.snapshots.every((s) => s.quotes.every((q) => q.decimalOdds > 1))).toBe(true);
  });

  it('produces movement, quality, model, value and risk for a monitored event', async () => {
    const repo = new MockSportsDataRepository({ latencyMs: 0 });
    const dataset = await repo.loadCanonicalDataset();
    const event = dataset.events.find((e) => e.id === 'EVT-SOC-1001')!;
    const market = primaryMarketFor(event.id, dataset.snapshots)!;
    expect(market).toBe('match-winner');

    const movement = computeMarketMovement(event.id, market, dataset.snapshots)!;
    expect(movement.selections.length).toBe(3);
    expect(movement.snapshotCount.value).toBeGreaterThan(5);
    expect(movement.selections.every((s) => s.series.length > 1)).toBe(true);

    const quality = assessDataQuality(event.id, market, dataset.snapshots, dataset.issues);
    expect(quality.score.value).toBeGreaterThan(0);
    expect(['A', 'B', 'C', 'D']).toContain(quality.grade);

    const model = computeModelProbabilities(
      event,
      market,
      movement.selections.map((s) => s.selectionId),
    );
    const sum = model.probabilities.reduce((s, p) => s + p.probability.value, 0);
    expect(sum).toBeCloseTo(1, 1);

    const value = computeValue(event.id, market, dataset.snapshots, model, quality);
    expect(value.signals.length).toBe(3);
    expect(value.overround.value).toBeGreaterThan(0.9);

    const risk = computeRisk(event, movement, quality, value);
    expect(risk.score.value).toBeGreaterThanOrEqual(0);
    expect(risk.score.value).toBeLessThanOrEqual(1);
    expect(risk.factors.length).toBe(6);
  });

  it('flags a stale, thinly covered market', async () => {
    const repo = new MockSportsDataRepository({ latencyMs: 0 });
    const dataset = await repo.loadCanonicalDataset();
    const quality = assessDataQuality('EVT-NHL-4001', 'moneyline', dataset.snapshots, dataset.issues);
    expect(quality.stale).toBe(true);
    expect(quality.issues.some((i) => i.code === 'stale-feed')).toBe(true);
    expect(quality.grade === 'C' || quality.grade === 'D').toBe(true);
  });

  it('detects correlation clusters against active exposure', async () => {
    const repo = new MockSportsDataRepository({ latencyMs: 0 });
    const dataset = await repo.loadCanonicalDataset();
    const event = dataset.events.find((e) => e.id === 'EVT-SOC-1002')!;
    const isolated = computeCorrelation(event, 'match-winner', []);
    expect(isolated.level).toBe('ISOLATED');

    const entangled = computeCorrelation(event, 'match-winner', [
      {
        eventId: 'EVT-OTHER',
        label: 'other',
        leagueId: event.league.id,
        teamIds: [event.homeTeam.id],
        startTime: event.startTime,
        market: 'match-winner',
      },
    ]);
    expect(entangled.level).not.toBe('ISOLATED');
    expect(entangled.clusters.length).toBeGreaterThan(1);
  });
});
