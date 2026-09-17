import type { AIAnalysisService } from './AIAnalysisService';
import type { AnalysisRequest, AnalysisResponse, QuantDecisionPacket } from './contracts';
import { runQuantDecision } from '../engine/quantDecisionEngine';
import type { SportsDataRepository } from '../domain/repositories';

/** Adds the deterministic Quant Decision packet to an existing analysis service. */
export class QuantAwareAnalysisService implements AIAnalysisService {
  readonly engineId = 'badbuilder-quant-aware-intelligence';
  readonly mode = 'core-engine' as const;

  constructor(
    private readonly base: AIAnalysisService,
    private readonly repo: SportsDataRepository,
  ) {}

  health() {
    return this.base.health();
  }

  async analyzeEvent(request: AnalysisRequest): Promise<AnalysisResponse> {
    const analysis = await this.base.analyzeEvent(request);
    const event = await this.repo.getEvent(request.eventId);
    if (!event) return analysis;

    const dataset = await this.repo.loadCanonicalDataset();
    const snapshots = dataset.snapshots.filter((snapshot) => snapshot.eventId === event.id && (!request.market || snapshot.market === request.market));
    const modelProbabilityBySelection = Object.fromEntries(
      analysis.probabilityEstimates.map((estimate) => [estimate.selectionId, estimate.modelProbability.value]),
    );
    const decision = runQuantDecision({
      event,
      snapshots,
      modelProbabilityBySelection,
    });

    const quantDecision: QuantDecisionPacket = {
      generatedAt: decision.generatedAt,
      marketSignals: decision.marketSignals.map((signal) => ({
        ...signal,
        fairProbabilitySource: modelProbabilityBySelection[signal.selectionId] !== undefined
          ? 'MODEL'
          : decision.marketSignals.find((candidate) => candidate.selectionId === signal.selectionId)?.fairProbability === signal.impliedProbability
            ? 'MARKET_IMPLIED'
            : 'DEVIG_CONSENSUS',
      })),
      candidates: decision.candidates,
      portfolio: {
        selected: decision.portfolio.selected.map((candidate) => candidate.id),
        rejected: decision.portfolio.rejected,
        combinedOdds: decision.portfolio.combinedOdds,
        baseProbability: decision.portfolio.baseProbability,
        adjustedProbability: decision.portfolio.adjustedProbability,
        estimatedEv: decision.portfolio.estimatedEv,
        dependencyMultiplier: decision.portfolio.dependencyMultiplier,
      },
      dependencies: {
        conflicts: decision.dependencies.conflicts,
        concentrationPenalty: decision.dependencies.concentrationPenalty,
        correlationPenalty: decision.dependencies.correlationPenalty,
        adjustedJointProbabilityMultiplier: decision.dependencies.adjustedJointProbabilityMultiplier,
      },
      steam: decision.steam,
      methodology: decision.methodology,
    };

    return { ...analysis, quantDecision };
  }
}
