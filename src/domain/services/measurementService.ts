import { det } from '../numbers';
import type { DeterministicNumber } from '../types';

const SERVICE_ID = 'measurement-service' as const;

export interface MeasurementInput {
  /** Model probability at analysis time. */
  modelProbability: number;
  /** Market implied probability at analysis time. */
  impliedProbabilityAtAnalysis: number;
  /** Market implied probability at close / measurement time. */
  impliedProbabilityAtClose: number;
  /** 1 if the observed selection occurred, 0 otherwise, null if unresolved. */
  outcome: 0 | 1 | null;
}

export interface MeasurementResult {
  brierScore: DeterministicNumber | null;
  closingLineValuePct: DeterministicNumber;
  realizedMovementPct: DeterministicNumber;
  calibrationDeltaPct: DeterministicNumber;
  verdict: 'beat-close' | 'matched-close' | 'lost-to-close' | 'unresolved';
}

/**
 * Stage 8: deterministic measurement. The only place where outcome maths lives.
 */
export function measure(input: MeasurementInput): MeasurementResult {
  const clv =
    input.impliedProbabilityAtAnalysis > 0
      ? ((input.impliedProbabilityAtClose - input.impliedProbabilityAtAnalysis) /
          input.impliedProbabilityAtAnalysis) *
        100
      : 0;
  const realizedMovement = clv;
  const calibrationDelta = (input.modelProbability - input.impliedProbabilityAtClose) * 100;
  const brier =
    input.outcome === null ? null : (input.modelProbability - input.outcome) ** 2;

  const verdict: MeasurementResult['verdict'] =
    input.outcome === null
      ? 'unresolved'
      : clv > 1.5
        ? 'beat-close'
        : clv < -1.5
          ? 'lost-to-close'
          : 'matched-close';

  return {
    brierScore: brier === null ? null : det(brier, 'ratio', SERVICE_ID),
    closingLineValuePct: det(clv, 'percent', SERVICE_ID),
    realizedMovementPct: det(realizedMovement, 'percent', SERVICE_ID),
    calibrationDeltaPct: det(calibrationDelta, 'percent', SERVICE_ID),
    verdict,
  };
}
