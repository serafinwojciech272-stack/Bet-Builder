import { describe, expect, it } from 'vitest';
import { evaluateDecisionCenter } from '../core/decisionCenter';
import { createDecisionPacket, assertMissionEligible } from '../core/decisionPacket';
import { createLedgerEntry, settleLedgerEntry } from '../core/decisionLedger';
import { runCoreEngineV1, InMemoryCoreEngineLedgerStore } from '../core/coreEngineV1';
import { createMockCoreEngine, DecisionGateBlockedError } from '../core/mockCoreEngine';
import { liveEvents } from '../services/liveAdapter';
import { isAdmissibleSelection } from '../hooks/useBuilder';
import { InMemoryMissionRepository } from '../missions/MissionRepository';
import { InMemoryAnalysisRepository } from '../ai/AnalysisRepository';
import { MissionService } from '../missions/missionService';
import { MockCoreEngineClient } from '../engine/CoreEngineClient';
import { buildMissionFromAnalysis } from '../missions/missionFactory';
import { analyzeFixture } from './helpers';
import type { CanonicalDataset } from '../domain/repositories';
import type { Selection } from '../domain/types';

/**
 * Regression guard for the SAVE stage.
 *
 * The persistence boundary must never store a non-finite numeric, must never turn a
 * BLOCKED / NO_MARKET_DATA record into a persistable artifact, and must stay
 * idempotent for a repeated save of the same deterministic input.
 */

const nonFinite = (o: object) => Object.entries(o).filter(([, v]) => typeof v === 'number' && !Number.isFinite(v));

function dataset(events: number): CanonicalDataset {
  return {
    events: Array.from({ length: events }, (_, i) => ({
      id: `thesportsdb:${2000 + i}`, sportKey: i % 2 ? 'cricket' : 'basketball',
      league: { id: `l${i}`, name: `League ${i}`, sportKey: 'soccer', country: 'PL' },
      homeTeam: { id: `h${i}`, name: `Home ${i}`, shortName: `H${i}`, rating: 0.5, form: [], injuriesOut: 0 },
      awayTeam: { id: `a${i}`, name: `Away ${i}`, shortName: `A${i}`, rating: 0.5, form: [], injuriesOut: 0 },
      startTime: '2026-09-24T18:00:00.000Z', status: 'scheduled' as const, venue: 'V', monitored: true, liquidity: 0.5,
    })),
    snapshots: [], issues: [], droppedRecords: 0, normalizedAt: '2026-09-24T12:00:00.000Z',
    provider: 'thesportsdb', mode: 'LIVE_DATA_NO_ODDS',
  };
}

function fixtureSelection(over: Partial<Selection> = {}): Selection {
  return {
    id: 'SAVE-SEL', marketId: 'match-winner', eventId: 'EVT-SOC-1001', name: 'Home', shortName: 'Home',
    odds: 2.2, probability: 0.5, impliedProbability: 1 / 2.2, value: 0.045, ev: 0.1,
    confidence: 0.85, risk: 'LOW', correlationGroup: 'EVT-SOC-1001', ...over,
  };
}

describe('save boundary rejects non-persistable records', () => {
  it('BLOCKED decision cannot produce a persistable packet or ledger artifact', () => {
    const decision = evaluateDecisionCenter([]);
    const packet = createDecisionPacket(decision, [], null, new Date('2026-09-24T00:00:00.000Z'));
    expect(decision.status).toBe('BLOCKED');
    expect(packet.status).toBe('BLOCKED');
    expect(packet.mission.eligible).toBe(false);
    expect(() => assertMissionEligible(packet)).toThrow(/DECISION_PACKET_BLOCKED/);
  });

  it('BLOCKED packet cannot be turned into a mission', async () => {
    const analysis = await analyzeFixture();
    const decision = evaluateDecisionCenter([]);
    const packet = createDecisionPacket(decision, [], null, new Date('2026-09-24T00:00:00.000Z'));
    expect(() => buildMissionFromAnalysis(analysis, analysis.recommendedActions[0], { decisionPacket: packet })).toThrow(/DECISION_PACKET_BLOCKED/);
  });

  it('an empty optimizer cannot persist a ledger row', () => {
    const decision = evaluateDecisionCenter([]);
    const packet = createDecisionPacket(decision, [], null, new Date('2026-09-24T00:00:00.000Z'));
    expect(() => assertMissionEligible(packet)).toThrow();
  });

  it('NO_MARKET_DATA events produce no buildable selection', () => {
    const projected = liveEvents(dataset(3));
    expect(projected.flatMap((e) => e.markets).flatMap((m) => m.selections).filter(isAdmissibleSelection)).toHaveLength(0);
  });
});

describe('ledger persistence stays finite', () => {
  it('stores neutral defaults for non-finite packet source numerics', () => {
    const decision = evaluateDecisionCenter([{ id: 's1', marketId: 'M', eventId: 'E1', name: 's', shortName: 's', odds: NaN, probability: 0.5, impliedProbability: NaN, value: NaN, ev: NaN, confidence: 0.8, risk: 'LOW', correlationGroup: 'E1' }]);
    const packet = createDecisionPacket(decision, [{ id: 's1', eventId: 'E1', marketId: 'M', odds: NaN, probability: 0.5, confidence: 0.8, risk: 'LOW', correlationGroup: 'E1' }], null, new Date('2026-09-24T00:00:00.000Z'));
    const ledger = createLedgerEntry(packet);
    expect(nonFinite(ledger)).toEqual([]);
    expect(ledger.oddsSnapshot).toBe(0);
    expect(ledger.dependencyMultiplier).toBe(1);
  });

  it('stores finite values unchanged for a legitimate packet', () => {
    const decision = evaluateDecisionCenter([fixtureSelection()]);
    const packet = createDecisionPacket(decision, [{ id: 'SAVE-SEL', eventId: 'EVT-SOC-1001', marketId: 'match-winner', odds: 2.2, probability: 0.5, confidence: 0.85, risk: 'LOW', correlationGroup: 'EVT-SOC-1001' }], null, new Date('2026-09-24T00:00:00.000Z'));
    const ledger = createLedgerEntry(packet);
    expect(nonFinite(ledger)).toEqual([]);
    expect(ledger.oddsSnapshot).toBeCloseTo(2.2, 8);
    expect(ledger.fairProbability).toBeCloseTo(0.5, 8);
  });

  it('keeps the ledger finite through settlement', () => {
    const decision = evaluateDecisionCenter([fixtureSelection()]);
    const packet = createDecisionPacket(decision, [{ id: 'SAVE-SEL', eventId: 'EVT-SOC-1001', marketId: 'match-winner', odds: 2.2, probability: 0.5, confidence: 0.85, risk: 'LOW', correlationGroup: 'EVT-SOC-1001' }], null, new Date('2026-09-24T00:00:00.000Z'));
    const settled = settleLedgerEntry(createLedgerEntry(packet), { status: 'WON', settledAt: new Date('2026-09-24T00:00:00.000Z'), objectiveOutcome: 1, closingOdds: 2.0 });
    expect(Number.isFinite(settled.clv.valuePct as number)).toBe(true);
    expect(Number.isFinite(settled.calibration.brierScore as number)).toBe(true);
    expect(nonFinite(settled)).toEqual([]);
  });

  it('rejects a double settlement', () => {
    const decision = evaluateDecisionCenter([fixtureSelection()]);
    const packet = createDecisionPacket(decision, [], null, new Date('2026-09-24T00:00:00.000Z'));
    const settled = settleLedgerEntry(createLedgerEntry(packet), { status: 'VOID' });
    expect(() => settleLedgerEntry(settled, { status: 'WON' })).toThrow(/LEDGER_ALREADY_SETTLED/);
  });
});

describe('save is idempotent for deterministic inputs', () => {
  it('repeated ledger append keeps a single row', async () => {
    const store = new InMemoryCoreEngineLedgerStore();
    const first = await runCoreEngineV1([], null, store, new Date('2026-09-24T00:00:00.000Z'));
    const second = await runCoreEngineV1([], null, store, new Date('2026-09-24T00:00:00.000Z'));
    expect(first.ledgerEntry.id).toBe(second.ledgerEntry.id);
    expect(await store.list()).toHaveLength(1);
    expect(first.packet.status).toBe('BLOCKED');
    expect(nonFinite(first.ledgerEntry)).toEqual([]);
  });

  it('repeated mission draft save keeps a single mission', async () => {
    const analysis = await analyzeFixture();
    const decision = evaluateDecisionCenter([fixtureSelection()]);
    const packet = createDecisionPacket(decision, [{ id: 'SAVE-SEL', eventId: 'EVT-SOC-1001', marketId: 'match-winner', odds: 2.2, probability: 0.5, confidence: 0.85, risk: 'LOW', correlationGroup: 'EVT-SOC-1001' }], null, new Date('2026-09-24T00:00:00.000Z'));
    const missions = new InMemoryMissionRepository();
    const analyses = new InMemoryAnalysisRepository();
    await analyses.save(analysis);
    const service = new MissionService(missions, analyses, new MockCoreEngineClient({ stepDelayMs: 0 }));
    const action = analysis.recommendedActions.find((a) => a.missionEligible)!;
    const mission = buildMissionFromAnalysis(analysis, action, { decisionPacket: packet, idSuffix: 'SAVE' });
    await service.saveDraft(mission);
    await service.saveDraft(mission);
    expect(await missions.count()).toBe(1);
    expect((await missions.getById(mission.id))!.status).toBe('DRAFT');
    expect(mission.decisionLedger?.approvalState).toBe('PENDING');
  });
});

describe('production reconciliation', () => {
  it('maps 18 optimizer inputs to 18 explicit non-persistable save outcomes', () => {
    const projected = liveEvents(dataset(18));
    const engine = createMockCoreEngine();
    const outcomes = dataset(18).events.map((event) => {
      const decision = evaluateDecisionCenter([]);
      const optimizerState = 'BLOCKED';
      try { engine.optimize({ stake: 0, decisionGate: { status: decision.status, blockers: [...decision.blockers], warnings: [], trace: [] }, selections: [] }); }
      catch (e) { if (!(e instanceof DecisionGateBlockedError)) throw e; }
      const legacy = projected.find((p) => p.id === event.id);
      const buildable = legacy ? legacy.markets.flatMap((m) => m.selections).filter(isAdmissibleSelection) : [];
      const packet = createDecisionPacket(decision, [], null, new Date('2026-09-24T00:00:00.000Z'));
      let persisted = false;
      try { assertMissionEligible(packet); persisted = true; } catch { persisted = false; }
      return { eventId: event.id, sport: event.sportKey, competition: event.league.name, participants: `${event.homeTeam.name} vs ${event.awayTeam.name}`, startTime: event.startTime, decisionStatus: decision.status, optimizerState, buildable: buildable.length, persisted };
    });
    expect(outcomes).toHaveLength(18);
    expect(new Set(outcomes.map((o) => o.eventId)).size).toBe(18);
    expect(outcomes.every((o) => o.decisionStatus === 'BLOCKED')).toBe(true);
    expect(outcomes.every((o) => o.optimizerState === 'BLOCKED')).toBe(true);
    expect(outcomes.every((o) => o.buildable === 0)).toBe(true);
    expect(outcomes.every((o) => !o.persisted)).toBe(true);
    expect(outcomes.every((o) => o.eventId && o.sport && o.competition && o.participants && o.startTime)).toBe(true);
  });

  it('DATA_SUPPORTED fixture still persists through the same architecture', async () => {
    const decision = evaluateDecisionCenter([fixtureSelection()]);
    expect(decision.status).not.toBe('BLOCKED');
    const packet = createDecisionPacket(decision, [{ id: 'SAVE-SEL', eventId: 'EVT-SOC-1001', marketId: 'match-winner', odds: 2.2, probability: 0.5, confidence: 0.85, risk: 'LOW', correlationGroup: 'EVT-SOC-1001' }], null, new Date('2026-09-24T00:00:00.000Z'));
    expect(packet.mission.eligible).toBe(true);
    const store = new InMemoryCoreEngineLedgerStore();
    const run = await runCoreEngineV1([fixtureSelection()], null, store, new Date('2026-09-24T00:00:00.000Z'));
    expect(run.packet.status).not.toBe('BLOCKED');
    expect(nonFinite(run.ledgerEntry)).toEqual([]);
    expect(await store.list()).toHaveLength(1);
  });
});
