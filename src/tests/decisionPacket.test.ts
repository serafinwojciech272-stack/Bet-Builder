import { describe, expect, it } from 'vitest';
import { createDecisionPacket, assertMissionEligible, type DecisionPacket } from '../core/decisionPacket';

const baseDecision = {
  status: 'READY' as const,
  combinedOdds: 2.4,
  baseProbability: 0.45,
  adjustedProbability: 0.42,
  ev: 0.008,
  dependencyMultiplier: 0.93,
  correlationRisk: 0.08,
  concentrationRisk: 0.5,
  confidence: 0.82,
  quality: 0.86,
  legDecisions: [],
  blockers: [],
  warnings: [],
  strengths: ['quality'],
  trace: ['quant complete', 'decision center evaluated'],
};

const selections = [{
  id: 'sel-1',
  eventId: 'EVT-1',
  marketId: 'h2h',
  odds: 2.4,
  probability: 0.45,
  confidence: 0.82,
  risk: 'LOW',
  correlationGroup: 'EVT-1',
}];

describe('Decision Packet contract', () => {
  it('preserves Decision Center evidence and Core Engine outcome in one packet', () => {
    const packet = createDecisionPacket(baseDecision, selections, {
      selections: ['sel-1'],
      rejectedSelections: [],
      rejectedReasons: {},
      stake: 50,
      combinedOdds: 2.4,
      estimatedProbability: 0.42,
      estimatedEv: 0.008,
      potentialReturn: 120,
      potentialProfit: 70,
      diversificationScore: 0,
      rationale: 'Decision Gate READY.',
    }, new Date('2026-09-17T21:30:00.000Z'));

    expect(packet.status).toBe('READY');
    expect(packet.source.dependencyMultiplier).toBe(0.93);
    expect(packet.coreOptimization?.selections).toEqual(['sel-1']);
    expect(packet.trace.at(-1)).toContain('Decision Packet status: READY');
    expect(() => assertMissionEligible(packet)).not.toThrow();
  });

  it('blocks mission creation for a blocked Decision Packet', () => {
    const packet = createDecisionPacket({
      ...baseDecision,
      status: 'BLOCKED',
      blockers: ['Mutually exclusive outcomes detected.'],
      warnings: [],
    }, selections);

    expect(packet.mission.eligible).toBe(false);
    expect(() => assertMissionEligible(packet)).toThrow(/DECISION_PACKET_BLOCKED/);
  });

  it('preserves CAUTION warnings without converting them into blockers', () => {
    const packet = createDecisionPacket({
      ...baseDecision,
      status: 'CAUTION',
      warnings: ['Portfolio EV is negative under the current model snapshot.'],
    }, selections);

    expect(packet.mission.eligible).toBe(true);
    expect(packet.warnings).toContain('Portfolio EV is negative under the current model snapshot.');
    expect(() => assertMissionEligible(packet)).not.toThrow();
  });
});
