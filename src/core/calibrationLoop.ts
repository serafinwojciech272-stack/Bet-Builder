import type { DecisionLedgerEntry, CalibrationSummary } from './decisionLedger.js';
import { calibrateLedger } from './decisionLedger.js';

export type CalibrationState = 'INSUFFICIENT_SAMPLE' | 'OBSERVE' | 'CALIBRATION_READY';

export interface CalibrationLoopResult {
  state: CalibrationState;
  summary: CalibrationSummary;
  sampleRequired: number;
  recommendedProbabilityShrinkage: number;
  rationale: string;
}

export function evaluateCalibrationLoop(
  entries: DecisionLedgerEntry[],
  sampleRequired = 20,
): CalibrationLoopResult {
  const summary = calibrateLedger(entries);
  const resolved = entries.filter((entry) => entry.calibration.sampleEligible && entry.settlement.objectiveOutcome !== null);
  const meanProbability = resolved.length
    ? resolved.reduce((sum, entry) => sum + entry.fairProbability, 0) / resolved.length
    : 0;
  const meanOutcome = resolved.length
    ? resolved.reduce((sum, entry) => sum + (entry.settlement.objectiveOutcome ?? 0), 0) / resolved.length
    : 0;
  const calibrationGap = meanProbability - meanOutcome;
  const shrinkage = resolved.length >= sampleRequired
    ? Math.max(-0.08, Math.min(0.08, -calibrationGap * 0.35))
    : 0;

  const state: CalibrationState =
    resolved.length < Math.min(5, sampleRequired) ? 'INSUFFICIENT_SAMPLE'
      : resolved.length < sampleRequired ? 'OBSERVE'
      : 'CALIBRATION_READY';

  const rationale = state === 'CALIBRATION_READY'
    ? `Resolved sample supports a bounded probability calibration review; suggested adjustment is ${(shrinkage * 100).toFixed(1)}pp.`
    : `Keep the model unchanged until at least ${sampleRequired} resolved observations are available; current resolved sample is ${resolved.length}.`;

  return {
    state,
    summary,
    sampleRequired,
    recommendedProbabilityShrinkage: shrinkage,
    rationale,
  };
}
