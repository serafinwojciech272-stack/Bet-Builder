import { LiveSportsDataRepository, type SportsDataRepository } from '../domain/repositories';
import { primaryMarketFor } from '../domain/services/movementService';
import type { CorrelationContextEntry } from '../domain/services/riskService';
import { MockAIAnalysisService } from '../ai/MockAIAnalysisService';
import { QuantAwareAnalysisService } from '../ai/quantAwareAnalysisService';
import type { AIAnalysisService } from '../ai/AIAnalysisService';
import { InMemoryAnalysisRepository, type AnalysisRepository } from '../ai/AnalysisRepository';
import { InMemoryMissionRepository, type MissionRepository } from '../missions/MissionRepository';
import { MissionService } from '../missions/missionService';
import { MockCoreEngineClient, type CoreEngineClient } from '../engine/CoreEngineClient';
import { InMemoryDecisionMemory, type DecisionMemoryRepository } from '../analytics/decisionMemory';

export interface Workspace {
  dataRepository: SportsDataRepository;
  analysisService: AIAnalysisService;
  analysisRepository: AnalysisRepository;
  missionRepository: MissionRepository;
  coreEngine: CoreEngineClient;
  decisionMemory: DecisionMemoryRepository;
  missionService: MissionService;
  seedAnalysisService: (now: Date) => AIAnalysisService;
  setFailNextAnalysis: (v: boolean) => void;
}

export function createWorkspace(): Workspace {
  const dataRepository = new LiveSportsDataRepository();
  const coreEngine = new MockCoreEngineClient({ stepDelayMs: 320 });
  const decisionMemory = new InMemoryDecisionMemory();
  let correlationCache: CorrelationContextEntry[] = [];
  let failNext = false;
  const correlationContext = () => correlationCache;

  void dataRepository.loadCanonicalDataset().then((dataset) => {
    correlationCache = dataset.events.map((e) => ({
      eventId: e.id,
      label: `${e.homeTeam.name} vs ${e.awayTeam.name}`,
      leagueId: e.league.id,
      teamIds: [e.homeTeam.id, e.awayTeam.id],
      startTime: e.startTime,
      market: primaryMarketFor(e.id, dataset.snapshots) ?? 'match-winner',
    }));
  }).catch(() => undefined);

  const baseAnalysisService = new MockAIAnalysisService(dataRepository, {
    latencyMs: 620,
    correlationContext,
    failNext: () => {
      if (failNext) {
        failNext = false;
        return true;
      }
      return false;
    },
  });
  const analysisService = new QuantAwareAnalysisService(baseAnalysisService, dataRepository, coreEngine, decisionMemory);

  const analysisRepository = new InMemoryAnalysisRepository();
  const missionRepository = new InMemoryMissionRepository();
  const missionService = new MissionService(missionRepository, analysisRepository, coreEngine);

  return {
    dataRepository,
    analysisService,
    analysisRepository,
    missionRepository,
    coreEngine,
    decisionMemory,
    missionService,
    seedAnalysisService: (now: Date) => new QuantAwareAnalysisService(
      new MockAIAnalysisService(dataRepository, { latencyMs: 0, correlationContext, now: () => now }),
      dataRepository,
      coreEngine,
      decisionMemory,
    ),
    setFailNextAnalysis: (v: boolean) => { failNext = v; },
  };
}
