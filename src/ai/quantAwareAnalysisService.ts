import type { AIAnalysisService } from './AIAnalysisService';
import type { AnalysisRequest, AnalysisResponse, QuantDecisionPacket } from './contracts';
import { runQuantDecision } from '../engine/quantDecisionEngine';
import type { SportsDataRepository } from '../domain/repositories';
import type { CoreEngineClient } from '../engine/CoreEngineClient';

/** Adds deterministic Quant Decision data and a single Core Engine optimization gate to the analysis contract. */
export class QuantAwareAnalysisService implements AIAnalysisService {
  readonly engineId = 'badbuilder-quant-aware-intelligence';
  readonly mode = 'core-engine' as const;

  constructor(
    private readonly base: AIAnalysisService,
    private readonly repo: SportsDataRepository,
    private readonly coreEngine: CoreEngineClient,
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

    const coreOptimization = await this.coreEngine.optimizeBuilder({
      selections: decision.candidates.map((candidate) => ({
        id: candidate.id,
        eventId: candidate.eventId,
        marketId: candidate.marketId,
        odds: candidate.odds,
        probability: candidate.probability,
        correlationGroup: candidate.correlationGroup,
        qualityScore: candidate.qualityScore,
      })),
      stake: 1,
      minEv: 0,
      maxSelections: request.depth === 'deep' ? 8 : 5,
      maxPerCorrelationGroup: 2,
      maxSameEvent: 2,
      minQualityScore: 55,
    });

    const quantDecision: QuantDecisionPacket = {
      generatedAt: decision.generatedAt,
      marketSignals: decision.marketSignals.map((signal) => ({
        ...signal,
        fairProbabilitySource: signal.fairProbabilitySource ?? 'MARKET_IMPLIED',
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
      coreOptimization: {
        selected: coreOptimization.selections,
        rejected: coreOptimization.rejectedSelections,
        combinedOdds: coreOptimization.combinedOdds,
        estimatedProbability: coreOptimization.estimatedProbability,
        estimatedEv: coreOptimization.estimatedEv,
        diversificationScore: coreOptimization.diversificationScore,
        rationale: coreOptimization.rationale,
      },
      dependencies: {
        conflicts: decision.dependencies.conflicts,
        concentrationPenalty: decision.dependencies.concentrationPenalty,
        correlationPenalty: decision.dependencies.correlationPenalty,
        adjustedJointProbabilityMultiplier: decision.dependencies.adjustedJointProbabilityMultiplier,
      },
      steam: decision.steam,
      methodology: [
        ...decision.methodology,
        'Core Engine is the final deterministic portfolio gate after market intelligence.',
        `Core Engine optimization returned ${coreOptimization.selections.length} selected and ${coreOptimization.rejectedSelections.length} rejected candidate(s).`,
      ],
    };

    return { ...analysis, quantDecision };
  }
}
