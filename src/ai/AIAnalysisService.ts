import type { AnalysisRequest, AnalysisResponse } from './contracts';
import type { ValidationResult } from './validation';

export interface AnalysisFailure {
  code: 'EVENT_NOT_FOUND' | 'NO_MARKET_DATA' | 'ENGINE_UNAVAILABLE' | 'CONTRACT_INVALID';
  message: string;
  retryable: boolean;
  validation?: ValidationResult;
}

export class AnalysisError extends Error implements AnalysisFailure {
  readonly code: AnalysisFailure['code'];
  readonly retryable: boolean;
  readonly validation?: ValidationResult;

  constructor(failure: AnalysisFailure) {
    super(failure.message);
    this.name = 'AnalysisError';
    this.code = failure.code;
    this.retryable = failure.retryable;
    this.validation = failure.validation;
  }
}

/**
 * Sports Intelligence port. `MockAIAnalysisService` implements it today;
 * a Core Engine-backed implementation can be dropped in with zero UI changes.
 */
export interface AIAnalysisService {
  readonly engineId: string;
  readonly mode: 'mock' | 'core-engine';
  analyzeEvent(request: AnalysisRequest): Promise<AnalysisResponse>;
  /** Cheap capability probe used by the UI for engine status. */
  health(): Promise<{ ok: boolean; engineId: string; latencyMs: number; detail: string }>;
}
