import type { Selection } from '../domain/types';
import type { AnalysisResponse } from '../core/types';

export interface DomainServices {
  sportsData: {
    listEvents(): import('../domain/types').Event[];
    listMarkets(eventId: string): import('../domain/types').Market[];
    listSelections(marketId: string): Selection[];
    getHistory(selectionId: string): import('../domain/types').OddsSnapshot[];
    getDataset(): import('../data/seed').DemoDataset;
  };
  odds: {
    getCurrentOdds(selectionId: string): number;
  };
  analysis: {
    analyzeSelection(selection: Selection): AnalysisResponse;
  };
  optimize: {
    optimize(selections: Selection[], stake: number): import('../core/types').OptimizationResult;
  };
  correlations: {
    findCorrelatedGroups(selections: Selection[]): string[][];
  };
}
