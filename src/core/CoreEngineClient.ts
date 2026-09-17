import type { AnalysisResponse, OptimizationRequest, OptimizationResult } from './types';

// Integration contract for the future Core AI Engine.
// The frontend depends only on this interface, never on the mock implementation.
export interface CoreEngineClient {
  getHealth(): Promise<{ status: string }>;
  analyzeSelection(input: {
    selectionId: string;
    odds: number;
    probability: number;
    confidence: number;
  }): Promise<AnalysisResponse>;
  analyzeBuilder(input: {
    selections: { id: string; odds: number; probability: number; correlationGroup: string }[];
  }): Promise<AnalysisResponse[]>;
  optimize(req: OptimizationRequest): Promise<OptimizationResult>;
}

export function createMockCoreEngineClient(engine: {
  getHealth?: () => { status: string };
  analyzeSelection: (...args: never[]) => AnalysisResponse;
  analyzeBuilder: (...args: never[]) => AnalysisResponse[];
  optimize: (req: OptimizationRequest) => OptimizationResult;
}): CoreEngineClient {
  return {
    getHealth: async () => engine.getHealth?.() ?? { status: 'ok' },
    analyzeSelection: async (input) => engine.analyzeSelection(input as never),
    analyzeBuilder: async (input) => engine.analyzeBuilder(input as never),
    optimize: async (req) => engine.optimize(req),
  };
}
