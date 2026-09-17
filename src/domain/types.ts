export type Sport = 'Football' | 'Basketball' | 'Tennis' | 'Ice Hockey' | 'Baseball' | string;

export type EventStatus = 'SCHEDULED' | 'LIVE' | 'FINISHED';

export interface Event {
  id: string;
  sport: Sport;
  league: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string; // ISO
  status: EventStatus;
}

export type MarketStatus = 'OPEN' | 'CLOSED' | 'SUSPENDED';

export interface Market {
  id: string;
  eventId: string;
  type: string;
  name: string;
  category: string;
  status: MarketStatus;
}

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface Selection {
  id: string;
  marketId: string;
  eventId: string;
  name: string;
  shortName: string;
  line?: number;
  odds: number;
  probability: number; // model probability 0..1
  impliedProbability: number; // 0..1
  value: number; // probability - implied
  ev: number; // probability*odds - 1
  confidence: number; // 0..1
  risk: RiskLevel;
  correlationGroup: string;
}

export interface OddsSnapshot {
  id: string;
  selectionId: string;
  odds: number;
  timestamp: string; // ISO
  provider: string;
  sourceQuality: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface EventWithMarkets extends Event {
  markets: (Market & { selections: Selection[] })[];
}

export const SPORTS: Sport[] = ['Football', 'Basketball', 'Tennis', 'Ice Hockey', 'Baseball'];
