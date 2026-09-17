import type { AnalysisResponse } from './contracts';
import type { MeasurementResult } from '../domain/services/measurementService';

export interface HistoricalOutcome {
  resolvedAt: string;
  selectionId: string;
  selectionLabel: string;
  /** 1 = selection occurred, 0 = it did not. */
  outcome: 0 | 1;
  measurement: MeasurementResult;
  note: string;
}

export interface AnalysisRecord {
  id: string;
  eventId: string;
  savedAt: string;
  analysis: AnalysisResponse;
  outcome: HistoricalOutcome | null;
}

export interface AnalysisQuery {
  eventId?: string;
  resolvedOnly?: boolean;
  stance?: AnalysisResponse['summary']['stance'];
  limit?: number;
}

/** Persistence port for analyses — in-memory today, Postgres/Core Engine later. */
export interface AnalysisRepository {
  save(analysis: AnalysisResponse): Promise<AnalysisRecord>;
  getById(analysisId: string): Promise<AnalysisRecord | null>;
  latestForEvent(eventId: string): Promise<AnalysisRecord | null>;
  list(query?: AnalysisQuery): Promise<AnalysisRecord[]>;
  attachOutcome(analysisId: string, outcome: HistoricalOutcome): Promise<AnalysisRecord | null>;
  count(): Promise<number>;
}

export class InMemoryAnalysisRepository implements AnalysisRepository {
  private readonly records = new Map<string, AnalysisRecord>();

  async save(analysis: AnalysisResponse): Promise<AnalysisRecord> {
    const record: AnalysisRecord = {
      id: analysis.analysisId,
      eventId: analysis.eventId,
      savedAt: new Date().toISOString(),
      analysis,
      outcome: this.records.get(analysis.analysisId)?.outcome ?? null,
    };
    this.records.set(record.id, record);
    return record;
  }

  async getById(analysisId: string): Promise<AnalysisRecord | null> {
    return this.records.get(analysisId) ?? null;
  }

  async latestForEvent(eventId: string): Promise<AnalysisRecord | null> {
    const forEvent = [...this.records.values()]
      .filter((r) => r.eventId === eventId)
      .sort((a, b) => b.analysis.generatedAt.localeCompare(a.analysis.generatedAt));
    return forEvent[0] ?? null;
  }

  async list(query: AnalysisQuery = {}): Promise<AnalysisRecord[]> {
    let out = [...this.records.values()];
    if (query.eventId) out = out.filter((r) => r.eventId === query.eventId);
    if (query.resolvedOnly) out = out.filter((r) => r.outcome !== null);
    if (query.stance) out = out.filter((r) => r.analysis.summary.stance === query.stance);
    out.sort((a, b) => b.analysis.generatedAt.localeCompare(a.analysis.generatedAt));
    return query.limit ? out.slice(0, query.limit) : out;
  }

  async attachOutcome(analysisId: string, outcome: HistoricalOutcome): Promise<AnalysisRecord | null> {
    const record = this.records.get(analysisId);
    if (!record) return null;
    const updated = { ...record, outcome };
    this.records.set(analysisId, updated);
    return updated;
  }

  async count(): Promise<number> {
    return this.records.size;
  }
}
