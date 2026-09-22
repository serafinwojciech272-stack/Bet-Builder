import { describe, expect, it } from 'vitest';
import { buildResearchEvidence } from './researchEvidenceEngine';
import type { EventResearch } from '../research/types';

const baseResearch = (overrides: Partial<EventResearch> = {}): EventResearch => ({
  researchId: 'R-TEST',
  eventId: 'EVT-TEST',
  generatedAt: '2026-09-22T12:00:00.000Z',
  queries: [],
  sources: [
    { url: 'u1', title: 'Official', publisher: 'Club', language: 'en', kind: 'official', reliability: 'A', publishedAt: '2026-09-22T11:00:00.000Z', snippet: '', matchedTerms: [] },
    { url: 'u2', title: 'Expert', publisher: 'Analyst', language: 'pl', kind: 'expert', reliability: 'B', publishedAt: '2026-09-22T10:00:00.000Z', snippet: '', matchedTerms: [] },
  ],
  findings: [
    { id: 'F1', category: 'lineup', statement: 'Supportive', polarity: 'supportive', confidence: 0.8, sourceIds: ['u1'], freshnessHours: 1, independentSourceCount: 1 },
    { id: 'F2', category: 'form', statement: 'Adverse', polarity: 'adverse', confidence: 0.4, sourceIds: ['u2'], freshnessHours: 10, independentSourceCount: 1 },
  ],
  consensus: { direction: 'mixed', score: 0.2, independentSources: 2, supportingSources: 1, adverseSources: 1, contradictionRate: 0.5 },
  sourceCoverage: { languages: ['en', 'pl'], official: 1, localMedia: 0, expert: 1, tipster: 0, community: 0 },
  lineupStatus: 'uncertain',
  researchQuality: 0.7,
  warnings: [],
  digest: 'D1',
  ...overrides,
});

describe('research evidence engine hardening', () => {
  it('bounds evidence quality, coverage and decision impact to [0,1]', () => {
    const result = buildResearchEvidence(baseResearch());
    for (const value of [result.quality, result.coverageScore, result.decisionImpact.net, result.decisionImpact.confidence]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(result.criticalWarnings).toEqual(expect.arrayContaining([
      'High contradiction rate in research evidence.',
    ]));
  });

  it('is observational and deterministic for identical research snapshots', () => {
    const research = baseResearch({ lineupStatus: 'confirmed', consensus: { ...baseResearch().consensus, contradictionRate: 0 } });
    const a = buildResearchEvidence(research);
    const b = buildResearchEvidence(research);
    expect(a.digest).toBe(b.digest);
    expect(a.auditTrail).toEqual(b.auditTrail);
    expect(research.sources).toHaveLength(2);
    expect(research.findings).toHaveLength(2);
  });

  it('does not create false conflicts from purely supportive evidence', () => {
    const research = baseResearch({
      findings: [{ id: 'F1', category: 'form', statement: 'Strong form', polarity: 'supportive', confidence: 0.9, sourceIds: ['u1'], freshnessHours: 2, independentSourceCount: 2 }],
      consensus: { direction: 'supportive', score: 0.8, independentSources: 2, supportingSources: 1, adverseSources: 0, contradictionRate: 0 },
      lineupStatus: 'confirmed',
    });
    const result = buildResearchEvidence(research);
    expect(result.conflicts).toHaveLength(0);
    expect(result.decisionImpact.adverse).toBe(0);
  });
});
