import { describe, expect, it } from 'vitest';
import { buildResearchQueries, normalizeResearchSources, synthesizeResearch } from './researchEngine';
import type { ResearchSource } from './types';

describe('research engine hardening', () => {
  it('builds a deterministic multilingual query matrix with the core research purposes', () => {
    const queries = buildResearchQueries('Team A', 'Team B', 'soccer', 'League X');
    expect(queries.length).toBe(13);
    expect(new Set(queries.map(q => q.language)).size).toBe(7);
    expect(new Set(queries.map(q => q.purpose))).toEqual(
      new Set(['lineup', 'preview', 'tipster-consensus', 'tactics']),
    );
    expect(queries.every(q => q.query.includes('Team A') && q.query.includes('Team B'))).toBe(true);
  });

  it('deduplicates matched terms and classifies source reliability without mutating input', () => {
    const input = [
      { url: 'u1', title: 'Official club statement', publisher: 'Club', language: 'en' as const, publishedAt: null, snippet: 'confirmed lineup' },
      { url: 'u2', title: 'Tactical preview', publisher: 'Analyst', language: 'pl' as const, publishedAt: null, snippet: 'forma tactics' },
      { url: 'u3', title: 'Betting prediction', publisher: 'Tipster', language: 'de' as const, publishedAt: null, snippet: 'Tipp Prognose' },
    ];
    const normalized = normalizeResearchSources(input);
    expect(normalized.map(s => s.reliability)).toEqual(['A', 'B', 'C']);
    expect(normalized.every(s => s.matchedTerms.length === new Set(s.matchedTerms).size)).toBe(true);
    expect(input[0].snippet).toBe('confirmed lineup');
  });

  it('handles empty research safely and exposes insufficient-data warnings', () => {
    const result = synthesizeResearch('EVT-EMPTY', [], [], new Date('2026-09-22T12:00:00.000Z'));
    expect(result.findings).toHaveLength(0);
    expect(result.consensus.direction).toBe('insufficient');
    expect(result.lineupStatus).toBe('unknown');
    expect(result.warnings).toEqual(expect.arrayContaining([
      'Fewer than three independent publishers found.',
      'No official-source confirmation found.',
      'No expert/local analysis source found.',
    ]));
    expect(result.digest).toBeTruthy();
  });

  it('produces stable finding ids and bounded quality for the same deterministic snapshot', () => {
    const sources: ResearchSource[] = [
      { url: 'u1', title: 'Official lineup', publisher: 'Club', language: 'en', kind: 'official', reliability: 'A', publishedAt: '2026-09-22T10:00:00.000Z', snippet: 'confirmed lineup available', matchedTerms: ['lineup'] },
      { url: 'u2', title: 'Local form preview', publisher: 'Local', language: 'pl', kind: 'local-media', reliability: 'B', publishedAt: '2026-09-22T09:00:00.000Z', snippet: 'good form preview', matchedTerms: ['form'] },
      { url: 'u3', title: 'Expert tactics', publisher: 'Expert', language: 'de', kind: 'expert', reliability: 'B', publishedAt: '2026-09-22T08:00:00.000Z', snippet: 'tactical analysis', matchedTerms: ['tactics'] },
    ];
    const a = synthesizeResearch('EVT-1', buildResearchQueries('A', 'B', 'soccer', 'L'), sources, new Date('2026-09-22T12:00:00.000Z'));
    const b = synthesizeResearch('EVT-1', buildResearchQueries('A', 'B', 'soccer', 'L'), sources, new Date('2026-09-22T12:00:00.000Z'));
    expect(a.digest).toBe(b.digest);
    expect(a.findings.map(f => f.id)).toEqual(b.findings.map(f => f.id));
    expect(a.researchQuality).toBeGreaterThanOrEqual(0);
    expect(a.researchQuality).toBeLessThanOrEqual(1);
  });
});
