import { MockSportsDataRepository } from '../domain/repositories';
import { MockAIAnalysisService } from '../ai/MockAIAnalysisService';
import type { AnalysisResponse } from '../ai/contracts';

export function testWorkspace() {
  const repo = new MockSportsDataRepository({ latencyMs: 0 });
  const service = new MockAIAnalysisService(repo, {
    latencyMs: 0,
    correlationContext: () => [
      {
        eventId: 'EVT-SOC-1002',
        label: 'Real Madrid vs Villarreal',
        leagueId: 'soccer-la-liga',
        teamIds: ['team-rma', 'team-vil'],
        startTime: new Date(Date.now() + 90 * 60_000).toISOString(),
        market: 'match-winner',
      },
    ],
  });
  return { repo, service };
}

export async function analyzeFixture(eventId = 'EVT-SOC-1001'): Promise<AnalysisResponse> {
  const { service } = testWorkspace();
  return service.analyzeEvent({ eventId, requestedBy: 'vitest' });
}
