export type ResearchLanguage = 'en' | 'de' | 'pl' | 'it' | 'es' | 'fr' | 'nl';
export type ResearchSourceKind = 'official' | 'local-media' | 'expert' | 'tipster' | 'community' | 'aggregator';
export type ResearchReliability = 'A' | 'B' | 'C' | 'D';

export interface ResearchQuery {
  language: ResearchLanguage;
  query: string;
  purpose: 'lineup' | 'injury' | 'form' | 'tactics' | 'preview' | 'tipster-consensus' | 'local-context';
}

export interface ResearchSource {
  url: string;
  title: string;
  publisher: string;
  language: ResearchLanguage;
  kind: ResearchSourceKind;
  reliability: ResearchReliability;
  publishedAt: string | null;
  snippet: string;
  matchedTerms: string[];
}

export interface ResearchFinding {
  id: string;
  category: 'lineup' | 'injury' | 'form' | 'tactics' | 'motivation' | 'local-context' | 'market-sentiment' | 'contradiction';
  statement: string;
  polarity: 'supportive' | 'adverse' | 'neutral';
  confidence: number;
  sourceIds: string[];
  freshnessHours: number;
  independentSourceCount: number;
}

export interface ResearchConsensus {
  direction: 'supportive' | 'adverse' | 'mixed' | 'insufficient';
  score: number;
  independentSources: number;
  supportingSources: number;
  adverseSources: number;
  contradictionRate: number;
}

export interface EventResearch {
  researchId: string;
  eventId: string;
  generatedAt: string;
  queries: ResearchQuery[];
  sources: ResearchSource[];
  findings: ResearchFinding[];
  consensus: ResearchConsensus;
  sourceCoverage: {
    languages: ResearchLanguage[];
    official: number;
    localMedia: number;
    expert: number;
    tipster: number;
    community: number;
  };
  lineupStatus: 'confirmed' | 'probable' | 'uncertain' | 'unknown';
  researchQuality: number;
  warnings: string[];
  digest: string;
}
