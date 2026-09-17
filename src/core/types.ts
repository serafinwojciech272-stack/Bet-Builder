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

export interface OptimizationSelection {
  id: string;
  odds: number;
  probability: number;
  correlationGroup: string;
}

export interface OptimizationRequest {
  selections: OptimizationSelection[];
  stake: number;
  minEv?: number;
}

export interface OptimizationResult {
  selections: string[];
  rejectedSelections: string[];
  stake: number;
  combinedOdds: number;
  estimatedProbability: number;
  estimatedEv: number;
  potentialReturn: number;
  potentialProfit: number;
  rationale: string;
}
