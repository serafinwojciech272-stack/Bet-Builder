/**
 * Canonical Sports Domain — single source of truth.
 *
 * Data flow:
 * Sports Data -> Normalization -> Canonical Sports Domain -> Odds Snapshots
 * -> Movement / Data Quality -> Sports Intelligence -> Core Engine Client
 * -> Mission -> Approval Gate -> Execution -> Measurement -> Learning
 */

export type SportKey = 'soccer' | 'basketball' | 'americanfootball' | 'icehockey' | 'baseball';
export type EventStatus = 'scheduled' | 'live' | 'final';
export type MarketKey = 'match-winner' | 'moneyline' | 'totals' | 'spread' | 'both-teams-to-score';
export type BookmakerId = 'openbook' | 'betfair' | 'northline' | 'apex' | 'meridian';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface Bookmaker { id: BookmakerId; name: string; weight: number; }
export interface Team { id: string; name: string; shortName: string; rating: number; form: Array<'W' | 'D' | 'L'>; injuriesOut: number; }
export interface League { id: string; name: string; sportKey: SportKey; country: string; }

export interface SportEvent {
  id: string; sportKey: SportKey; league: League; homeTeam: Team; awayTeam: Team;
  startTime: string; status: EventStatus; venue: string; monitored: boolean; liquidity: number;
}

export interface OddsQuote { selectionId: string; label: string; decimalOdds: number; }
export interface OddsSnapshot {
  id: string; eventId: string; market: MarketKey; bookmaker: BookmakerId; capturedAt: string;
  quotes: OddsQuote[]; feedLatencyMs: number; provider: string;
}

export type NormalizationIssueCode = 'odds-missing' | 'odds-out-of-range' | 'probability-out-of-range' | 'stale-odds' | 'unknown-market' | 'unmapped-team';
export interface NormalizationIssue { code: NormalizationIssueCode; severity: 'info' | 'warning' | 'error'; message: string; reference?: string; }
export interface NormalizationResult<T> { value: T; issues: NormalizationIssue[]; droppedRecords: number; }

export type NumericUnit = 'probability' | 'percent' | 'decimal-odds' | 'ratio' | 'count' | 'minutes' | 'score';
export interface DeterministicNumber { value: number; unit: NumericUnit; serviceId: DomainServiceId; provenance: 'deterministic'; formatted: string; }
export type DomainServiceId = 'odds-math' | 'movement-service' | 'data-quality-service' | 'probability-service' | 'value-service' | 'risk-service' | 'correlation-service' | 'measurement-service';

/** Transitional contracts for the existing Builder UI; migrate these to SportEvent/market snapshots incrementally. */
export interface Event {
  id: string; sport: string; league: string; competition: string; homeTeam: string; awayTeam: string;
  startTime: string; status: 'SCHEDULED' | 'LIVE' | 'FINISHED';
}
export interface Market {
  id: string; eventId: string; type: string; name: string; category: string; status: 'OPEN' | 'SUSPENDED' | 'CLOSED';
}
export interface Selection {
  id: string; marketId: string; eventId: string; name: string; shortName: string; line?: number;
  odds: number; probability: number; impliedProbability: number; value: number; ev: number;
  confidence: number; risk: RiskLevel; correlationGroup: string;
}
export interface DemoOddsSnapshot {
  id: string; selectionId: string; odds: number; timestamp: string; provider: string; sourceQuality: 'HIGH' | 'MEDIUM' | 'LOW';
}
