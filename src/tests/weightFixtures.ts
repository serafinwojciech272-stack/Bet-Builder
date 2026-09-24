import type { AnalysisResponse } from '../ai/contracts';
import { analyzeFixture } from './helpers';
import { buildMissionFromAnalysis } from '../missions/missionFactory';
import { factorImpact } from '../domain/services/riskService';
import type { DeterministicNumber } from '../domain/types';

/**
 * Removes the `weight`/`score` objects from an analysis's risk factors to
 * simulate the historical production failure mode where an analysis reached
 * consumers with absent weighting metadata.
 */
export async function analyzeFixtureEventWithMissingWeights(): Promise<AnalysisResponse> {
  const analysis = await analyzeFixture();
  return {
    ...analysis,
    riskAssessment: {
      ...analysis.riskAssessment,
      factors: analysis.riskAssessment.factors.map((factor) => ({
        ...factor,
        weight: undefined as unknown as DeterministicNumber,
        score: undefined as unknown as DeterministicNumber,
      })),
    },
  };
}

/**
 * The exact narrative/consumer shape used by `MockAIAnalysisService.compose`:
 * sort risk factors by weighted impact and fold the winner's note into prose.
 */
export function narrativeFromRiskFactors(
  factors: AnalysisResponse['riskAssessment']['factors'],
): string {
  const worst = factors.slice().sort((a, b) => factorImpact(b) - factorImpact(a))[0];
  return `Risk factors unavailable in this snapshot. ${worst?.note ?? 'none'}`;
}

/** Exercises the mission-drafting consumer against a missing-weight analysis. */
export function draftMissionWithMissingWeights(analysis: AnalysisResponse) {
  const action = analysis.recommendedActions[0];
  return buildMissionFromAnalysis(analysis, action);
}
