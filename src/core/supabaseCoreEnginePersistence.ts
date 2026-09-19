import type { DecisionLedgerEntry } from './decisionLedger';
import type { AuditEvent } from './auditTrail';
import type { CoreEngineRun, CoreEngineLedgerStore } from './coreEngineV1';

export interface SupabaseRestConfig {
  url: string;
  serviceRoleKey: string;
}

type SupabaseRow = Record<string, unknown>;

const endpoint = (url: string, table: string) => `${url.replace(/\/$/, '')}/rest/v1/${table}`;

async function request(config: SupabaseRestConfig, table: string, init: RequestInit) {
  const response = await fetch(endpoint(config.url, table), {
    ...init,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`SUPABASE_PERSISTENCE_FAILED:${table}:${response.status}:${body.slice(0, 300)}`);
  }
}

const ledgerRow = (entry: DecisionLedgerEntry): SupabaseRow => ({
  id: entry.id,
  decision_packet_id: entry.decisionPacketId,
  recorded_at: entry.recordedAt,
  status: entry.status,
  selection_ids: entry.selectionIds,
  odds_snapshot: entry.oddsSnapshot,
  fair_probability: entry.fairProbability,
  confidence: entry.confidence,
  quality: entry.quality,
  risk: entry.risk,
  dependency_multiplier: entry.dependencyMultiplier,
  approval_state: entry.approvalState,
  mission_id: entry.missionId,
  settlement: entry.settlement,
  clv: entry.clv,
  calibration: entry.calibration,
  learning: entry.learning,
});

const fromLedgerRow = (row: SupabaseRow): DecisionLedgerEntry => ({
  id: String(row.id),
  decisionPacketId: String(row.decision_packet_id),
  recordedAt: String(row.recorded_at),
  status: row.status as DecisionLedgerEntry['status'],
  selectionIds: Array.isArray(row.selection_ids) ? row.selection_ids.map(String) : [],
  oddsSnapshot: Number(row.odds_snapshot),
  fairProbability: Number(row.fair_probability),
  confidence: Number(row.confidence),
  quality: Number(row.quality),
  risk: String(row.risk),
  dependencyMultiplier: Number(row.dependency_multiplier),
  approvalState: String(row.approval_state),
  missionId: row.mission_id === null || row.mission_id === undefined ? null : String(row.mission_id),
  settlement: row.settlement as DecisionLedgerEntry['settlement'],
  clv: row.clv as DecisionLedgerEntry['clv'],
  calibration: row.calibration as DecisionLedgerEntry['calibration'],
  learning: row.learning as DecisionLedgerEntry['learning'],
});

export class SupabaseCoreEngineLedgerStore implements CoreEngineLedgerStore {
  constructor(private readonly config: SupabaseRestConfig) {}

  async append(entry: DecisionLedgerEntry) {
    await request(this.config, 'bb_decision_ledger', {
      method: 'POST',
      body: JSON.stringify(ledgerRow(entry)),
    });
  }

  async list() {
    const response = await fetch(
      `${endpoint(this.config.url, 'bb_decision_ledger')}?select=*&order=recorded_at.desc`,
      {
        headers: {
          apikey: this.config.serviceRoleKey,
          Authorization: `Bearer ${this.config.serviceRoleKey}`,
        },
      },
    );
    if (!response.ok) throw new Error(`SUPABASE_PERSISTENCE_FAILED:bb_decision_ledger:LIST:${response.status}`);
    const rows = await response.json() as SupabaseRow[];
    return rows.map(fromLedgerRow);
  }

  async persistRun(run: CoreEngineRun) {
    await request(this.config, 'bb_decision_runs', {
      method: 'POST',
      body: JSON.stringify({
        run_id: run.runId,
        engine_version: run.version,
        execution_policy: run.executionPolicy,
        status: run.orchestrator.decision.status,
        packet_id: run.packet.id,
        fingerprint: run.packet.fingerprint,
        input_digest: run.audit[0]?.payloadDigest ?? null,
        output_digest: run.audit.at(-1)?.payloadDigest ?? null,
        audit_valid: run.auditIntegrity.valid,
        calibration_state: run.calibration.state,
      }),
    });
  }

  async persistAudit(events: AuditEvent[]) {
    if (!events.length) return;
    await request(this.config, 'bb_audit_events', {
      method: 'POST',
      body: JSON.stringify(events.map((event) => ({
        id: event.id,
        run_id: event.runId,
        event_type: event.type,
        at: event.at,
        actor: event.actor,
        payload_digest: event.payloadDigest,
        previous_hash: event.previousHash,
        hash: event.hash,
      }))),
    });
  }
}

export function createSupabaseCoreEngineLedgerStoreFromEnv(): SupabaseCoreEngineLedgerStore | null {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && serviceRoleKey ? new SupabaseCoreEngineLedgerStore({ url, serviceRoleKey }) : null;
}
