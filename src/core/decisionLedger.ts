import type { DecisionPacket } from './decisionPacket';

export type SettlementStatus = 'PENDING' | 'WON' | 'LOST' | 'VOID' | 'CANCELLED';

export interface DecisionLedgerEntry {
  id: string;
  decisionPacketId: string;
  recordedAt: string;
  status: DecisionPacket['status'];
  selectionIds: string[];
  oddsSnapshot: number;
  fairProbability: number;
  confidence: number;
  quality: number;
  risk: string;
  dependencyMultiplier: number;
  approvalState: string;
  missionId: string | null;
  settlement: { status: SettlementStatus; settledAt: string | null; objectiveOutcome: number | null; closingOdds: number | null };
  clv: { valuePct: number | null; measured: boolean };
  calibration: { brierScore: number | null; logLoss: number | null; sampleEligible: boolean };
  learning: { feedback: 'PENDING' | 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'; lesson: string | null };
}

export interface SettlementInput {
  status: Exclude<SettlementStatus, 'PENDING'>;
  settledAt?: Date;
  objectiveOutcome?: number;
  closingOdds?: number;
}

export interface CalibrationSummary {
  sampleSize: number;
  resolvedCount: number;
  meanBrierScore: number | null;
  meanLogLoss: number | null;
  meanClvPct: number | null;
  positiveClvRate: number | null;
}

const clampProbability = (value: number) => Math.min(1 - 1e-9, Math.max(1e-9, value));
const binaryBrier = (p: number, outcome: number) => (p - outcome) ** 2;
const binaryLogLoss = (p: number, outcome: number) => {
  const probability = clampProbability(p);
  return -(outcome * Math.log(probability) + (1 - outcome) * Math.log(1 - probability));
};

export function createLedgerEntry(packet: DecisionPacket, options: { approvalState?: string; missionId?: string | null; now?: Date } = {}): DecisionLedgerEntry {
  const now = options.now ?? new Date();
  return {
    id: `LED-${packet.id}`,
    decisionPacketId: packet.id,
    recordedAt: now.toISOString(),
    status: packet.status,
    selectionIds: [...packet.source.selectionIds],
    oddsSnapshot: packet.source.combinedOdds,
    fairProbability: packet.source.adjustedProbability,
    confidence: packet.source.confidence,
    quality: packet.source.quality,
    risk: packet.selections[0]?.risk ?? 'UNKNOWN',
    dependencyMultiplier: packet.source.dependencyMultiplier,
    approvalState: options.approvalState ?? 'PENDING',
    missionId: options.missionId ?? null,
    settlement: { status: 'PENDING', settledAt: null, objectiveOutcome: null, closingOdds: null },
    clv: { valuePct: null, measured: false },
    calibration: { brierScore: null, logLoss: null, sampleEligible: false },
    learning: { feedback: 'PENDING', lesson: null },
  };
}

export function settleLedgerEntry(entry: DecisionLedgerEntry, input: SettlementInput): DecisionLedgerEntry {
  if (entry.settlement.status !== 'PENDING') throw new Error(`LEDGER_ALREADY_SETTLED: ${entry.id}`);
  const next = structuredClone(entry);
  const outcome = input.objectiveOutcome;
  next.settlement = {
    status: input.status,
    settledAt: (input.settledAt ?? new Date()).toISOString(),
    objectiveOutcome: outcome ?? null,
    closingOdds: input.closingOdds ?? null,
  };
  if (input.closingOdds && input.closingOdds > 0 && entry.oddsSnapshot > 0) {
    next.clv = { valuePct: (1 / input.closingOdds - 1 / entry.oddsSnapshot) * 100, measured: true };
  }
  if (outcome === 0 || outcome === 1) {
    next.calibration = {
      brierScore: binaryBrier(entry.fairProbability, outcome),
      logLoss: binaryLogLoss(entry.fairProbability, outcome),
      sampleEligible: true,
    };
  }
  if (input.status === 'VOID' || input.status === 'CANCELLED') {
    next.learning = { feedback: 'NEUTRAL', lesson: 'Outcome excluded from directional learning because the decision did not settle normally.' };
  } else if (next.clv.measured && (next.clv.valuePct ?? 0) > 0) {
    next.learning = { feedback: 'POSITIVE', lesson: 'Positive closing-line movement retained as learning evidence.' };
  } else if (next.calibration.sampleEligible) {
    next.learning = { feedback: 'NEGATIVE', lesson: 'Resolved outcome available; compare calibration error with the next model revision.' };
  } else {
    next.learning = { feedback: 'NEUTRAL', lesson: 'Settlement recorded without enough evidence for directional learning.' };
  }
  return next;
}

export function calibrateLedger(entries: DecisionLedgerEntry[]): CalibrationSummary {
  const resolved = entries.filter((entry) => entry.calibration.sampleEligible);
  const clv = entries.filter((entry) => entry.clv.measured).map((entry) => entry.clv.valuePct as number);
  const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  return {
    sampleSize: entries.length,
    resolvedCount: resolved.length,
    meanBrierScore: mean(resolved.map((entry) => entry.calibration.brierScore as number)),
    meanLogLoss: mean(resolved.map((entry) => entry.calibration.logLoss as number)),
    meanClvPct: mean(clv),
    positiveClvRate: clv.length ? clv.filter((value) => value > 0).length / clv.length : null,
  };
}
