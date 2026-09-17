export interface CalibrationObservation { probability: number; outcome: 0 | 1; }

export interface CalibrationBin { lower: number; upper: number; count: number; predicted: number; observed: number; error: number; }

export interface CalibrationReport { sampleSize: number; brierScore: number; logLoss: number; calibrationError: number; bins: CalibrationBin[]; }

function clamp(value: number): number { return Math.min(1 - 1e-12, Math.max(1e-12, value)); }

export function brierScore(observations: CalibrationObservation[]): number {
  if (!observations.length) return 0;
  return observations.reduce((sum, item) => sum + (item.probability - item.outcome) ** 2, 0) / observations.length;
}

export function logLoss(observations: CalibrationObservation[]): number {
  if (!observations.length) return 0;
  return -observations.reduce((sum, item) => {
    const p = clamp(item.probability);
    return sum + item.outcome * Math.log(p) + (1 - item.outcome) * Math.log(1 - p);
  }, 0) / observations.length;
}

export function calibrationReport(observations: CalibrationObservation[], binCount = 10): CalibrationReport {
  if (!observations.length) return { sampleSize: 0, brierScore: 0, logLoss: 0, calibrationError: 0, bins: [] };
  const count = Math.max(1, Math.min(20, Math.floor(binCount)));
  const bins: CalibrationBin[] = [];
  let weightedError = 0;
  for (let index = 0; index < count; index += 1) {
    const lower = index / count;
    const upper = (index + 1) / count;
    const members = observations.filter((item) => item.probability >= lower && (index === count - 1 ? item.probability <= upper : item.probability < upper));
    if (!members.length) continue;
    const predicted = members.reduce((sum, item) => sum + item.probability, 0) / members.length;
    const observed = members.reduce((sum, item) => sum + item.outcome, 0) / members.length;
    const error = Math.abs(predicted - observed);
    weightedError += error * members.length / observations.length;
    bins.push({ lower, upper, count: members.length, predicted, observed, error });
  }
  return { sampleSize: observations.length, brierScore: brierScore(observations), logLoss: logLoss(observations), calibrationError: weightedError, bins };
}
