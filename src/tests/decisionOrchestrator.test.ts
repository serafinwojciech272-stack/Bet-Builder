import { describe, expect, it } from 'vitest';
import { orchestrateDecision, assertOrchestratorReady } from '../core/decisionOrchestrator';
import { buildResearchEvidence } from '../core/researchEvidenceEngine';
import { createDecisionPacket } from '../core/decisionPacket';
import type { EventResearch } from '../research/types';
import type { Selection } from '../domain/types';

const selection: Selection = {
  id: 'SEL-1', marketId: 'MKT-1', eventId: 'EVT-1', name: 'Home', shortName: 'H',
  odds: 2.2, probability: 0.5, impliedProbability: 1 / 2.2, value: 0.045, ev: 0.1,
  confidence: 0.85, risk: 'LOW', correlationGroup: 'EVT-1',
};

const research: EventResearch = {
  researchId: 'R-1', eventId: 'EVT-1', generatedAt: '2026-09-18T00:00:00.000Z',
  queries: [], sources: [
    { url: 'https://official.test', title: 'Official team news', publisher: 'Official Club', language: 'en', kind: 'official', reliability: 'A', publishedAt: '2026-09-18T00:00:00.000Z', snippet: 'lineup confirmed', matchedTerms: ['lineup'] },
    { url: 'https://local.test', title: 'Local preview', publisher: 'Local Media', language: 'de', kind: 'local-media', reliability: 'B', publishedAt: '2026-09-18T00:00:00.000Z', snippet: 'form preview', matchedTerms: ['form'] },
    { url: 'https://expert.test', title: 'Expert analysis', publisher: 'Expert Desk', language: 'pl', kind: 'expert', reliability: 'B', publishedAt: '2026-09-18T00:00:00.000Z', snippet: 'tactics', matchedTerms: ['tactics'] },
  ],
  findings: [
    { id: 'F-1', category: 'lineup', statement: 'Confirmed lineup', polarity: 'supportive', confidence: 0.9, sourceIds: ['https://official.test'], freshnessHours: 1, independentSourceCount: 1 },
    { id: 'F-2', category: 'form', statement: 'Good recent form', polarity: 'supportive', confidence: 0.8, sourceIds: ['https://local.test', 'https://expert.test'], freshnessHours: 4, independentSourceCount: 2 },
  ],
  consensus: { direction: 'supportive', score: 0.8, independentSources: 3, supportingSources: 2, adverseSources: 0, contradictionRate: 0 },
  sourceCoverage: { languages: ['en', 'de', 'pl'], official: 1, localMedia: 1, expert: 1, tipster: 0, community: 0 },
  lineupStatus: 'confirmed', researchQuality: 0.8, warnings: [], digest: 'DIGEST-1',
};

describe('Decision Orchestrator integration', () => {
  it('requires research before mission readiness', () => {
    const result = orchestrateDecision([selection], null);
    expect(result.stage).toBe('REVIEW_REQUIRED');
    expect(result.packetEligible).toBe(false);
    expect(result.missionReady).toBe(false);
    expect(result.reviewFlags).toContain('RESEARCH_GATE_NOT_READY');
  });

  it('connects research -> evidence -> control -> decision', () => {
    const result = orchestrateDecision([selection], research);
    expect(result.evidence).not.toBeNull();
    expect(result.evidence?.evidence.length).toBe(2);
    expect(result.control.researchGate.ready).toBe(true);
    expect(result.decision.status).not.toBe('BLOCKED');
    expect(result.fingerprint).toMatch(/^[0-9a-f]+$/);
  });

  it('is deterministic for the same inputs', () => {
    const a = orchestrateDecision([selection], research);
    const b = orchestrateDecision([selection], research);
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.evidence?.digest).toBe(b.evidence?.digest);
  });

  it('persists the evidence artifact into the Decision Packet', () => {
    const result = orchestrateDecision([selection], research);
    const packet = createDecisionPacket(result.decision, [{
      id: selection.id, eventId: selection.eventId, marketId: selection.marketId, odds: selection.odds,
      probability: selection.probability, confidence: selection.confidence, risk: selection.risk,
      correlationGroup: selection.correlationGroup,
    }], null, new Date('2026-09-18T00:00:00.000Z'), research, result.evidence);
    expect(packet.researchEvidence?.digest).toBe(result.evidence?.digest);
    expect(packet.trace.some(line => line.includes('Evidence Engine'))).toBe(true);
  });

  it('throws when the orchestrator is not ready', () => {
    const result = orchestrateDecision([selection], null);
    expect(() => assertOrchestratorReady(result)).toThrow(/ORCHESTRATOR_REVIEW_REQUIRED/);
  });
});

describe('Research Evidence Engine', () => {
  it('weights official evidence and records coverage', () => {
    const evidence = buildResearchEvidence(research);
    expect(evidence.quality).toBeGreaterThan(0.5);
    expect(evidence.coverageScore).toBeGreaterThan(0.4);
    expect(evidence.evidence[0].reliabilityScore).toBe(1);
  });
});
