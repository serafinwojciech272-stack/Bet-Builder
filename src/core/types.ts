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
  eventId?: string;
  marketId?: string;
  confidence?: number;
  risk?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  qualityScore?: number;
}

export interface OptimizationRequest {
  selections: OptimizationSelection[];
  stake: number;
  minEv?: number;
  maxSelections?: number;
  maxPerCorrelationGroup?: number;
  minConfidence?: number;
  maxSameEvent?: number;
  minQualityScore?: number;
  maxCombinedOdds?: number;
}

export interface OptimizationResult {
  selections: string[];
  rejectedSelections: string[];
  rejectedReasons: Record<string, string>;
  stake: number;
  combinedOdds: number;
  estimatedProbability: number;
  estimatedEv: number;
  potentialReturn: number;
  potentialProfit: number;
  diversificationScore: number;
  rationale: string;
}
