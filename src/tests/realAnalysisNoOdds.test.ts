import { describe, expect, it } from 'vitest';
import { MockAIAnalysisService } from '../ai/MockAIAnalysisService';
import { validateAnalysisResponse } from '../ai/validation';
import { findUntaggedNumbers, isDeterministicNumber } from '../domain/numbers';
import type { CanonicalDataset, SportsDataRepository } from '../domain/repositories';
import type { OddsSnapshot, SportEvent } from '../domain/types';

/**
 * Mirrors the production provider contract for a real date: 18 real events from
 * `thesportsdb` with real provider ids, teams and competitions, but
 * `snapshots: []` and `bookmakers: []` (LIVE_DATA_NO_ODDS).
 */
const FIXTURES: Array<[string, string, string, string, string]> = [
  ['thesportsdb:2449218', 'basketball', 'wnba', 'New York Liberty', 'Atlanta Dream'],
  ['thesportsdb:2465911', 'cricket', 'english-county-championship-division-1', 'Warwickshire', 'Leicestershire'],
  ['thesportsdb:2406811', 'soccer', 'american-major-league-soccer', 'Seattle Sounders', 'Real Salt Lake'],
  ['thesportsdb:2476505', 'icehockey', 'swedish-hockey-league', 'Djurgårdens IF', 'Växjö Lakers'],
  ['thesportsdb:2269515', 'soccer', 'uefa-european-under-21-championship', 'Belgium U21', 'Belarus U21'],
];

function realEvent(index: number): SportEvent {
  const [id, sportKey, leagueId, home, away] = FIXTURES[index % FIXTURES.length];
  return {
    id: `${id}-${index}`,
    sportKey: sportKey as SportEvent['sportKey'],
    league: {
      id: leagueId,
      name: leagueId.replace(/-/g, ' '),
      sportKey: sportKey as SportEvent['sportKey'],
      country: 'International',
    },
    homeTeam: { id: `home-${index}`, name: home, shortName: home.slice(0, 18), rating: 0.5, form: [], injuriesOut: 0 },
    awayTeam: { id: `away-${index}`, name: away, shortName: away.slice(0, 18), rating: 0.5, form: [], injuriesOut: 0 },
    startTime: '2026-09-24T18:00:00.000Z',
    status: 'scheduled',
    venue: '',
    monitored: true,
    liquidity: 0.5,
  };
}

function realDataset(count: number): CanonicalDataset {
  const events = Array.from({ length: count }, (_, i) => realEvent(i));
  return {
    events,
    snapshots: [] as OddsSnapshot[],
    issues: [
      { code: 'thesportsdb-no-odds', severity: 'info', message: 'REAL EVENTS AVAILABLE', reference: events[0].id },
      { code: 'thesportsdb-no-odds', severity: 'info', message: 'NO BOOKMAKER ODDS', reference: events[0].id },
    ],
    droppedRecords: 0,
    normalizedAt: '2026-09-24T17:46:20.235Z',
    provider: 'thesportsdb',
    mode: 'LIVE_DATA_NO_ODDS',
    requestedDate: '2026-09-24',
    sportsQueried: ['soccer', 'basketball', 'cricket', 'icehockey'],
    bookmakers: [],
    availableSports: [],
  };
}

class RealNoOddsRepo implements SportsDataRepository {
  private readonly dataset: CanonicalDataset;
  constructor(count = 18) {
    this.dataset = realDataset(count);
  }
  async loadCanonicalDataset(): Promise<CanonicalDataset> {
    return this.dataset;
  }
  async getEvent(eventId: string) {
    return this.dataset.events.find((e) => e.id === eventId) ?? null;
  }
  async getSnapshots(): Promise<OddsSnapshot[]> {
    return [];
  }
}

const EVENT_COUNT = 18;

describe('REAL ANALYSIS — real no-odds events', () => {
  it('analyzes all 18 real events without throwing and without inventing odds', async () => {
    const repo = new RealNoOddsRepo(EVENT_COUNT);
    const service = new MockAIAnalysisService(repo, { latencyMs: 0 });
    const dataset = await repo.loadCanonicalDataset();

    const results = await Promise.all(
      dataset.events.map((event) => service.analyzeEvent({ eventId: event.id, requestedBy: 'vitest' })),
    );

    // Input/output reconciliation: one analysis per input event, no silent drops.
    expect(results).toHaveLength(dataset.events.length);
    expect(results).toHaveLength(EVENT_COUNT);
    const analyzedIds = results.map((r) => r.eventId);
    expect(new Set(analyzedIds).size).toBe(EVENT_COUNT);
    expect(new Set(analyzedIds)).toEqual(new Set(dataset.events.map((e) => e.id)));

    for (const analysis of results) {
      // Explicit insufficient-odds state instead of a crash or a fabricated price.
      expect(analysis.meta.dataStatus).toBe('INSUFFICIENT_ODDS_DATA');
      expect(analysis.meta.oddsAvailable).toBe(false);
      expect(analysis.meta.partial).toBe(true);
      expect(analysis.meta.degradedReasons).toContain('insufficient-odds-data');

      // No fabricated market data of any kind.
      expect(analysis.probabilityEstimates).toEqual([]);
      expect(analysis.valueSignals).toEqual([]);
      expect(analysis.marketObservations).toEqual([]);
      expect(analysis.sourceSnapshots).toEqual([]);

      // Provider provenance preserved.
      expect(analysis.eventId).toMatch(/^thesportsdb:/);
      expect(analysis.context.eventLabel).toContain(' vs ');
      expect(analysis.context.leagueName.length).toBeGreaterThan(0);
      expect(analysis.context.sportLabel.length).toBeGreaterThan(0);
      expect(Number.isNaN(Date.parse(analysis.context.startTime))).toBe(false);
      expect(Number.isNaN(Date.parse(analysis.generatedAt))).toBe(false);

      // Contract still valid and every figure deterministically tagged.
      expect(validateAnalysisResponse(analysis).errors).toEqual([]);
      expect(isDeterministicNumber(analysis.confidence.score)).toBe(true);
      expect(findUntaggedNumbers(analysis.riskAssessment)).toEqual([]);
      expect(findUntaggedNumbers(analysis.correlationAssessment)).toEqual([]);

      // No NaN/Infinity escaping into critical numeric outputs.
      expect(Number.isFinite(analysis.confidence.score.value)).toBe(true);
      expect(Number.isFinite(analysis.dataQuality.score.value)).toBe(true);
      expect(Number.isFinite(analysis.riskAssessment.score.value)).toBe(true);
      expect(Number.isFinite(analysis.correlationAssessment.score.value)).toBe(true);
      expect(analysis.riskAssessment.factors.every((f) => Number.isFinite(f.score.value) && Number.isFinite(f.weight.value))).toBe(true);

      // No odds-derived action may be mission-eligible.
      expect(analysis.recommendedActions.length).toBeGreaterThan(0);
      expect(analysis.recommendedActions.every((a) => a.missionEligible === false)).toBe(true);
      expect(analysis.context.market).toBeNull();
      expect(analysis.summary.stance).toBe('cautious');
      expect(analysis.warnings.some((w) => w.id === 'w-no-odds')).toBe(true);
    }
  });

  it('marks a market-specific request for a no-odds event as insufficient', async () => {
    const repo = new RealNoOddsRepo(1);
    const service = new MockAIAnalysisService(repo, { latencyMs: 0 });
    const event = (await repo.loadCanonicalDataset()).events[0];
    const analysis = await service.analyzeEvent({ eventId: event.id, market: 'match-winner', requestedBy: 'vitest' });
    expect(analysis.meta.dataStatus).toBe('INSUFFICIENT_ODDS_DATA');
    expect(analysis.probabilityEstimates).toEqual([]);
    expect(analysis.context.market).toBe('match-winner');
    expect(analysis.context.marketLabel.length).toBeGreaterThan(0);
  });

  it('still rejects an unknown event id', async () => {
    const repo = new RealNoOddsRepo(1);
    const service = new MockAIAnalysisService(repo, { latencyMs: 0 });
    await expect(
      service.analyzeEvent({ eventId: 'thesportsdb:does-not-exist', requestedBy: 'vitest' }),
    ).rejects.toMatchObject({ code: 'EVENT_NOT_FOUND' });
  });

  it('rejects an insufficient-odds response that smuggles in model probabilities', async () => {
    const repo = new RealNoOddsRepo(1);
    const service = new MockAIAnalysisService(repo, { latencyMs: 0 });
    const event = (await repo.loadCanonicalDataset()).events[0];
    const analysis = await service.analyzeEvent({ eventId: event.id, requestedBy: 'vitest' });
    const tampered = {
      ...analysis,
      probabilityEstimates: [
        {
          selectionId: 'synthetic',
          label: 'Synthetic',
          modelProbability: analysis.confidence.score,
          impliedProbability: analysis.confidence.score,
          fairProbability: analysis.confidence.score,
          modelFairOdds: analysis.confidence.score,
          divergencePct: analysis.confidence.score,
          modelVersion: 'tampered',
          drivers: [],
          origin: 'deterministic' as const,
        },
      ],
    };
    const result = validateAnalysisResponse(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === 'probabilityEstimates')).toBe(true);
  });
});
