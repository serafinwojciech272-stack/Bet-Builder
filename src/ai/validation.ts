import { findUntaggedNumbers, isDeterministicNumber } from '../domain/numbers';
import type { AnalysisResponse } from './contracts';

export interface ValidationError {
  path: string;
  code:
    | 'missing-field'
    | 'empty-collection'
    | 'untagged-number'
    | 'out-of-range'
    | 'probability-not-normalized'
    | 'invalid-timestamp'
    | 'missing-provenance';
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

function isIso(value: unknown): boolean {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

/**
 * Contract guard for anything entering the app from an analysis provider
 * (mock today, Core Engine tomorrow).
 */
export function validateAnalysisResponse(response: AnalysisResponse): ValidationResult {
  const errors: ValidationError[] = [];
  const require = (cond: boolean, error: ValidationError) => {
    if (!cond) errors.push(error);
  };

  require(Boolean(response.analysisId), {
    path: 'analysisId',
    code: 'missing-field',
    message: 'analysisId is required',
  });
  require(Boolean(response.eventId), {
    path: 'eventId',
    code: 'missing-field',
    message: 'eventId is required',
  });
  require(isIso(response.generatedAt), {
    path: 'generatedAt',
    code: 'invalid-timestamp',
    message: 'generatedAt must be an ISO timestamp',
  });
  require(Boolean(response.summary?.headline), {
    path: 'summary.headline',
    code: 'missing-field',
    message: 'summary.headline is required',
  });
  require((response.summary?.narrative?.length ?? 0) > 0, {
    path: 'summary.narrative',
    code: 'empty-collection',
    message: 'summary.narrative must contain at least one paragraph',
  });
  require(response.summary?.origin === 'ai-inference', {
    path: 'summary.origin',
    code: 'missing-provenance',
    message: 'summary must be flagged as ai-inference',
  });

  const conf = response.confidence?.score;
  require(isDeterministicNumber(conf), {
    path: 'confidence.score',
    code: 'untagged-number',
    message: 'confidence.score must be a deterministic number',
  });
  if (isDeterministicNumber(conf)) {
    require(conf.value >= 0 && conf.value <= 1, {
      path: 'confidence.score',
      code: 'out-of-range',
      message: 'confidence.score must be within 0..1',
    });
  }

  const insufficientOdds = response.meta?.dataStatus === 'INSUFFICIENT_ODDS_DATA';
  require(
    response.meta?.dataStatus === 'ODDS_AVAILABLE' || insufficientOdds,
    {
      path: 'meta.dataStatus',
      code: 'missing-field',
      message: 'meta.dataStatus must declare whether odds were available',
    },
  );

  if (insufficientOdds) {
    // An event-level analysis without bookmaker odds must not smuggle in any
    // market-derived figure. Every prices-bearing collection must be empty and
    // the digest must still be reproducible from event data alone.
    require(response.meta.oddsAvailable === false, {
      path: 'meta.oddsAvailable',
      code: 'out-of-range',
      message: 'meta.oddsAvailable must be false when dataStatus is INSUFFICIENT_ODDS_DATA',
    });
    require((response.probabilityEstimates?.length ?? 0) === 0, {
      path: 'probabilityEstimates',
      code: 'empty-collection',
      message: 'insufficient-odds analysis must not emit model probabilities',
    });
    require((response.valueSignals?.length ?? 0) === 0, {
      path: 'valueSignals',
      code: 'empty-collection',
      message: 'insufficient-odds analysis must not emit value/edge signals',
    });
    require((response.marketObservations?.length ?? 0) === 0, {
      path: 'marketObservations',
      code: 'empty-collection',
      message: 'insufficient-odds analysis must not emit market observations',
    });
    require((response.sourceSnapshots?.length ?? 0) === 0, {
      path: 'sourceSnapshots',
      code: 'empty-collection',
      message: 'insufficient-odds analysis must not cite odds snapshots',
    });
    require(response.recommendedActions.every((a) => !a.missionEligible), {
      path: 'recommendedActions',
      code: 'missing-field',
      message: 'insufficient-odds analysis must not mark actions as mission-eligible',
    });
  } else {
    require((response.probabilityEstimates?.length ?? 0) > 0, {
      path: 'probabilityEstimates',
      code: 'empty-collection',
      message: 'probabilityEstimates must not be empty',
    });
    require((response.sourceSnapshots?.length ?? 0) > 0, {
      path: 'sourceSnapshots',
      code: 'empty-collection',
      message: 'analysis must cite at least one odds snapshot',
    });
  }

  for (const est of response.probabilityEstimates ?? []) {
    const p = est.modelProbability?.value ?? -1;
    require(p >= 0 && p <= 1, {
      path: `probabilityEstimates[${est.selectionId}].modelProbability`,
      code: 'out-of-range',
      message: 'model probability must be within 0..1',
    });
    require(est.origin === 'deterministic', {
      path: `probabilityEstimates[${est.selectionId}].origin`,
      code: 'missing-provenance',
      message: 'probability estimates must be deterministic',
    });
  }

  const total = (response.probabilityEstimates ?? []).reduce(
    (sum, e) => sum + (e.modelProbability?.value ?? 0),
    0,
  );
  if ((response.probabilityEstimates?.length ?? 0) > 1) {
    require(Math.abs(total - 1) <= 0.06, {
      path: 'probabilityEstimates',
      code: 'probability-not-normalized',
      message: `model probabilities must sum to ~1 (received ${total.toFixed(3)})`,
    });
  }

  require(Boolean(response.meta?.deterministicInputsDigest), {
    path: 'meta.deterministicInputsDigest',
    code: 'missing-field',
    message: 'meta.deterministicInputsDigest is required for reproducibility',
  });

  // Rule 1: the AI layer may not mint numbers. Any bare number outside the
  // allow-list below means a value bypassed the deterministic services.
  const allowList = new Set([
    '$.marketObservations',
    '$.sourceSnapshots',
    '$.meta',
    '$.context',
  ]);
  for (const [key, value] of Object.entries(response as unknown as Record<string, unknown>)) {
    const path = `$.${key}`;
    if (allowList.has(path)) continue;
    for (const offender of findUntaggedNumbers(value, path)) {
      errors.push({
        path: offender,
        code: 'untagged-number',
        message: 'raw number found — all figures must come from a deterministic service',
      });
    }
  }

  return { valid: errors.length === 0, errors };
}
