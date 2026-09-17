/**
 * Canonical Sports Domain — Phase 1/2 contracts (single source of truth).
 *
 * Data flow:
 *   Sports Data -> Normalization -> Canonical Sports Domain -> Odds Snapshots
 *   -> Movement / Data Quality -> Sports Intelligence -> Core Engine Client
 *   -> Mission -> Approval Gate -> Execution -> Measurement -> Learning
 *
 * Nothing in the AI layer may redefine these types.
 */

export type SportKey =
  | 'soccer'
  | 'basketball'
  | 'americanfootball'
  | 'icehockey'
  | 'baseball';

export type EventStatus = 'scheduled' | 'live' | 'final';

export type MarketKey =
  | 'match-winner'
  | 'moneyline'
  | 'totals'
  | 'spread'
  | 'both-teams-to-score';

export type BookmakerId =
  | 'openbook'
  | 'betfair'
  | 'northline'
  | 'apex'
  | 'meridian';

export interface Bookmaker {
  id: BookmakerId;
  name: string;
  /** Modelled marginal reliability weight used by deterministic services. */
  weight: number;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  /** Deterministic strength input (no AI involvement). */
  rating: number;
  /** Last five results, most recent first: W / D / L. */
  form: Array<'W' | 'D' | 'L'>;
  injuriesOut: number;
}

export interface League {
  id: string;
  name: string;
  sportKey: SportKey;
  country: string;
}

export interface SportEvent {
  id: string;
  sportKey: SportKey;
  league: League;
  homeTeam: Team;
  awayTeam: Team;
  startTime: string;
  status: EventStatus;
  venue: string;
  monitored: boolean;
  /** Modelled market liquidity 0..1 (deterministic feed attribute). */
  liquidity: number;
}

export interface OddsQuote {
  selectionId: string;
  label: string;
  decimalOdds: number;
}

export interface OddsSnapshot {
  id: string;
  eventId: string;
  market: MarketKey;
  bookmaker: BookmakerId;
  capturedAt: string;
  quotes: OddsQuote[];
  feedLatencyMs: number;
  provider: string;
}

export type NormalizationIssueCode =
  | 'odds-missing'
  | 'odds-out-of-range'
  | 'probability-out-of-range'
  | 'stale-odds'
  | 'unknown-market'
  | 'unmapped-team';

export interface NormalizationIssue {
  code: NormalizationIssueCode;
  severity: 'info' | 'warning' | 'error';
  message: string;
  reference?: string;
}

export interface NormalizationResult<T> {
  value: T;
  issues: NormalizationIssue[];
  droppedRecords: number;
}

/** Every number surfaced to the intelligence layer is tagged with its origin. */
export type NumericUnit = 'probability' | 'percent' | 'decimal-odds' | 'ratio' | 'count' | 'minutes' | 'score';

export interface DeterministicNumber {
  value: number;
  unit: NumericUnit;
  /** Id of the deterministic domain service that produced the value. */
  serviceId: DomainServiceId;
  /** Always 'deterministic' — the AI layer may never mint numbers. */
  provenance: 'deterministic';
  formatted: string;
}

export type DomainServiceId =
  | 'odds-math'
  | 'movement-service'
  | 'data-quality-service'
  | 'probability-service'
  | 'value-service'
  | 'risk-service'
  | 'correlation-service'
  | 'measurement-service';
