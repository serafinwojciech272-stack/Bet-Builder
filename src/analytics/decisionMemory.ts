import { calculateCLV, type CLVAssessment } from './advancedQuant';
import { calibrationReport, type CalibrationObservation, type CalibrationReport } from './calibration';

export interface DecisionSelectionRecord {
  selectionId: string;
  eventId: string;
  marketId?: string;
  oddsAtDecision: number;
  modelProbability: number;
  fairProbabilitySource: 'MODEL' | 'DEVIG_CONSENSUS' | 'MARKET_IMPLIED';
  qualityScore?: number;
  selected: boolean;
}

export interface DecisionRecord {
  decisionId: string;
  eventId: string;
  generatedAt: string;
  selections: DecisionSelectionRecord[];
  combinedOdds: number;
  estimatedProbability: number;
  estimatedEv: number;
  dependencyMultiplier: number;
  coreRationale: string;
  settledAt?: string;
  settledSelectionOutcomes?: Record<string, 0 | 1>;
  clv?: Record<string, CLVAssessment>;
}

export interface DecisionMemoryRepository {
  record(record: DecisionRecord): void;
  get(decisionId: string): DecisionRecord | undefined;
  list(): DecisionRecord[];
  settle(decisionId: string, outcomes: Record<string, 0 | 1>, closingOddsBySelection?: Record<string, number>): DecisionRecord | undefined;
  calibration(): CalibrationReport;
}

/** In-memory decision ledger. It is deliberately an adapter boundary: production persistence can be added without changing the engine contract. */
export class InMemoryDecisionMemory implements DecisionMemoryRepository {
  private readonly records = new Map<string, DecisionRecord>();

  record(record: DecisionRecord): void {
    this.records.set(record.decisionId, structuredClone(record));
  }

  get(decisionId: string): DecisionRecord | undefined {
    const record = this.records.get(decisionId);
    return record ? structuredClone(record) : undefined;
  }

  list(): DecisionRecord[] {
    return [...this.records.values()].map((record) => structuredClone(record));
  }

  settle(decisionId: string, outcomes: Record<string, 0 | 1>, closingOddsBySelection: Record<string, number> = {}): DecisionRecord | undefined {
    const current = this.records.get(decisionId);
    if (!current) return undefined;

    const clv: Record<string, CLVAssessment> = {};
    for (const selection of current.selections) {
      const closingOdds = closingOddsBySelection[selection.selectionId];
      if (closingOdds !== undefined) clv[selection.selectionId] = calculateCLV(selection.oddsAtDecision, closingOdds);
    }

    const updated: DecisionRecord = {
      ...current,
      settledAt: new Date().toISOString(),
      settledSelectionOutcomes: { ...outcomes },
      clv,
    };
    this.records.set(decisionId, structuredClone(updated));
    return structuredClone(updated);
  }

  calibration(): CalibrationReport {
    const observations: CalibrationObservation[] = [];
    for (const record of this.records.values()) {
      if (!record.settledSelectionOutcomes) continue;
      for (const selection of record.selections) {
        const outcome = record.settledSelectionOutcomes[selection.selectionId];
        if (outcome !== undefined && selection.fairProbabilitySource === 'MODEL') {
          observations.push({ probability: selection.modelProbability, outcome });
        }
      }
    }
    return calibrationReport(observations);
  }
}
