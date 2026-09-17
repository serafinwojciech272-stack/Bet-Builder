import type { Event, Market, OddsSnapshot, Selection } from '../domain/types';

export interface SportsDataService {
  listEvents(): Event[];
  listMarkets(eventId: string): Market[];
  listSelections(marketId: string): Selection[];
  listOddsHistory(selectionId: string): OddsSnapshot[];
}

export interface OddsService {
  getCurrentOdds(selectionId: string): number;
  getMovement(selectionId: string): { open: number; current: number; movement: 'UP' | 'DOWN' | 'STABLE'; movementPct: number; lastUpdated: string };
}

export interface AnalysisService {
  analyzeSelection(selectionId: string): import('../core/types').AnalysisResponse;
}

export interface DataQualityService {
  getDataQuality(selectionId: string): { freshnessSeconds: number; sourceQuality: string; completeness: number; confidence: number; lastUpdate: string };
}

export interface PortfolioService {
  exposureForSelections(selections: Selection[]): number;
}

export interface MissionService {
  listMissions(): { id: string; title: string; description: string; status: string; createdAt: string; updatedAt: string }[];
}
