import { describe, expect, it } from 'vitest';
import { evaluateDecisionCenter } from '../core/decisionCenter';
import { evaluateControlPlane } from '../core/controlPlane';
import type { Selection } from '../domain/types';
import type { EventResearch } from '../research/types';

/**
 * Regression guard for the decision path on sparse / non-finite provider payloads.
 *
 * Event-only providers (TheSportsDB) surface events without the full deterministic
 * payload, so a probability, value or research-quality input may be missing or
 * non-finite. The decision path must degrade deterministically instead of
 * propagating NaN into EV, confidence or control-plane scores.
 */

function selection(overrides: Partial<Selection> = {}): Selection {
  return {
    id: 'S1', marketId: 'MKT', eventId: 'E1', name: 'Home', shortName: 'Home',
    odds: 2.2, probability: 0.5, impliedProbability: 1 / 2.2, value: 0.045, ev: 0.1,
    confidence: 0.85, risk: 'LOW', correlationGroup: 'E1', ...overrides,
  };
}

describe('decision path non-finite hardening', () => {
  it('keeps probability-derived outputs finite for a NaN model probability', () => {
    const decision = evaluateDecisionCenter([selection({ probability: NaN })]);
    for (const value of [decision.baseProbability, decision.adjustedProbability, decision.ev, decision.confidence, decision.quality, decision.marketQuality.score]) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(decision.status).not.toBe('READY');
  });

  it('keeps control-plane signal scores finite when a selection value is absent', () => {
    const control = evaluateControlPlane([selection({ value: undefined as unknown as number })]);
    expect(control.opportunitySignals).toHaveLength(1);
    expect(Number.isFinite(control.opportunitySignals[0].signalScore)).toBe(true);
  });

  it('keeps the research gate quality finite for a non-finite researchQuality', () => {
    const research = {
      researchId: 'R', eventId: 'E1', generatedAt: '2026-09-24T00:00:00.000Z', queries: [],
      sources: [{ url: 'u', title: 't', publisher: 'p', language: 'en' as const, kind: 'local-media' as const, reliability: 'B' as const, publishedAt: null, snippet: '', matchedTerms: [] }],
      findings: [{ id: 'F', category: 'form' as const, statement: 's', polarity: 'supportive' as const, confidence: 0.5, sourceIds: ['u'], freshnessHours: 2, independentSourceCount: 1 }],
      consensus: { direction: 'supportive' as const, score: 0.5, independentSources: 1, supportingSources: 1, adverseSources: 0, contradictionRate: 0 },
      sourceCoverage: { languages: ['en'], official: 0, localMedia: 1, expert: 0, tipster: 0, community: 0 },
      lineupStatus: 'confirmed' as const, researchQuality: NaN, warnings: [], digest: 'D',
    } satisfies EventResearch;
    const control = evaluateControlPlane([selection()], evaluateDecisionCenter([selection()]), { E1: research });
    expect(Number.isFinite(control.researchGate.quality)).toBe(true);
    expect(control.researchGate.ready).toBe(false);
  });
});