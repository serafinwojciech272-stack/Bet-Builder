import type { Mission, MissionStatus, MissionType } from './types';

export interface MissionQuery {
  status?: MissionStatus | MissionStatus[];
  eventId?: string;
  type?: MissionType;
  sourceAnalysisId?: string;
}

export interface MissionRepository {
  save(mission: Mission): Promise<Mission>;
  getById(id: string): Promise<Mission | null>;
  list(query?: MissionQuery): Promise<Mission[]>;
  remove(id: string): Promise<boolean>;
  count(): Promise<number>;
}

export class InMemoryMissionRepository implements MissionRepository {
  private readonly missions = new Map<string, Mission>();

  async save(mission: Mission): Promise<Mission> {
    this.missions.set(mission.id, mission);
    return mission;
  }

  async getById(id: string): Promise<Mission | null> {
    return this.missions.get(id) ?? null;
  }

  async list(query: MissionQuery = {}): Promise<Mission[]> {
    let out = [...this.missions.values()];
    if (query.status) {
      const wanted = Array.isArray(query.status) ? query.status : [query.status];
      out = out.filter((m) => wanted.includes(m.status));
    }
    if (query.eventId) out = out.filter((m) => m.target.eventId === query.eventId);
    if (query.type) out = out.filter((m) => m.type === query.type);
    if (query.sourceAnalysisId) out = out.filter((m) => m.sourceAnalysisId === query.sourceAnalysisId);
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async remove(id: string): Promise<boolean> {
    return this.missions.delete(id);
  }

  async count(): Promise<number> {
    return this.missions.size;
  }
}
