export interface AnalysisResponse {
  probability: number;
  impliedProbability: number;
  value: number;
  ev: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number;
  explanation: string;
  factors: string[];
  warnings: string[];
  dataQuality: 'High' | 'Medium' | 'Low';
}

export interface OptimizationRequest {
  selections: string[];
  stake: number;
}

export interface OptimizationResult {
  selections: string[];
  stake: number;
  combinedOdds: number;
  estimatedEv: number;
  rationale: string;
}
