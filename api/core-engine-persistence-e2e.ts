import { timingSafeEqual } from 'node:crypto';
import type { Selection } from '../src/domain/types.js';
import { runCoreEngineV1 } from '../src/core/coreEngineV1.js';
import { verifyAuditChain, type AuditEvent } from '../src/core/auditTrail.js';
import { createSupabaseCoreEngineLedgerStoreFromEnv } from '../src/core/supabaseCoreEnginePersistence.js';

interface E2ERequest {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
}

interface E2EResponse {
  status: (code: number) => E2EResponse;
  setHeader: (name: string, value: string) => E2EResponse;
  end: (body?: string) => void;
}

const TEST_NOW = new Date('2026-01-01T00:00:00.000Z');
const TEST_RUN_ID = `CE1-${TEST_NOW.getTime()}`;

const selection: Selection = {
  id: 'e2e-persistence-selection',
  marketId: 'e2e-persistence-market',
  eventId: 'e2e-persistence-event',
  name: 'E2E synthetic selection',
  shortName: 'E2E',
  odds: 2.1,
  probability: 0.52,
  impliedProbability: 1 / 2.1,
  value: 0.52 - 1 / 2.1,
  ev: 0.52 * 2.1 - 1,
  confidence: 0.78,
  risk: 'LOW',
  correlationGroup: 'e2e-persistence-event',
  dataFreshness: 0.96,
  bookmakerDepth: 4,
};

function json(res: E2EResponse, status: number, body: unknown) {
  res
    .status(status)
    .setHeader('Content-Type', 'application/json; charset=utf-8')
    .setHeader('Cache-Control', 'no-store')
    .setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.end(JSON.stringify(body));
}

function header(req: E2ERequest, name: string): string {
  const value = req.headers?.[name.toLowerCase()] ?? req.headers?.[name];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function authorized(req: E2ERequest): boolean {
  const expected = process.env.CORE_ENGINE_E2E_TOKEN?.trim() ?? '';
  if (!expected) return false;

  const bearer = header(req, 'authorization');
  const supplied = bearer.toLowerCase().startsWith('bearer ')
    ? bearer.slice(7).trim()
    : header(req, 'x-core-engine-e2e-token').trim();

  if (!supplied || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

async function supabaseRows(url: string, key: string, table: string, query: string): Promise<Record<string, unknown>[]> {
  const response = await fetch(
    `${url.replace(/\/$/, '')}/rest/v1/${table}?${query}`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    },
  );
  if (!response.ok) throw new Error(`E2E_READBACK_FAILED:${table}:${response.status}`);
  return await response.json() as Record<string, unknown>[];
}

export default async function handler(req: E2ERequest, res: E2EResponse) {
  if (!authorized(req)) return json(res, 404, { error: 'NOT_FOUND' });
  if (req.method !== 'POST') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });

  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return json(res, 503, { error: 'CORE_ENGINE_PERSISTENCE_NOT_CONFIGURED' });

  try {
    const store = createSupabaseCoreEngineLedgerStoreFromEnv();
    if (!store) return json(res, 503, { error: 'CORE_ENGINE_PERSISTENCE_NOT_CONFIGURED' });

    const before = {
      runs: await supabaseRows(url, key, 'bb_decision_runs', `run_id=eq.${encodeURIComponent(TEST_RUN_ID)}&select=run_id,packet_id,audit_valid,calibration_state`),
      ledger: await supabaseRows(url, key, 'bb_decision_ledger', `id=eq.${encodeURIComponent(`LED-DP-${TEST_NOW.getTime()}-e2e-persistence-selection`)}&select=id,decision_packet_id`),
      audit: await supabaseRows(url, key, 'bb_audit_events', `run_id=eq.${encodeURIComponent(TEST_RUN_ID)}&select=id,run_id,event_type,at,actor,payload_digest,previous_hash,hash&order=id.asc`),
    };

    const first = await runCoreEngineV1([selection], null, store, TEST_NOW);
    const second = await runCoreEngineV1([selection], null, store, TEST_NOW);

    const after = {
      runs: await supabaseRows(url, key, 'bb_decision_runs', `run_id=eq.${encodeURIComponent(TEST_RUN_ID)}&select=run_id,packet_id,audit_valid,calibration_state`),
      ledger: await supabaseRows(url, key, 'bb_decision_ledger', `id=eq.${encodeURIComponent(first.ledgerEntry.id)}&select=id,decision_packet_id,status`),
      audit: await supabaseRows(url, key, 'bb_audit_events', `run_id=eq.${encodeURIComponent(TEST_RUN_ID)}&select=id,run_id,event_type,at,actor,payload_digest,previous_hash,hash&order=id.asc`),
    };

    const persistedAudit = after.audit.map((row) => ({
      id: String(row.id),
      runId: String(row.run_id),
      type: row.event_type as AuditEvent['type'],
      at: String(row.at),
      actor: row.actor as AuditEvent['actor'],
      payloadDigest: String(row.payload_digest),
      previousHash: row.previous_hash === null ? null : String(row.previous_hash),
      hash: String(row.hash),
    }));
    const auditIntegrity = verifyAuditChain(persistedAudit);

    const idempotent =
      first.runId === TEST_RUN_ID &&
      second.runId === TEST_RUN_ID &&
      first.packet.id === second.packet.id &&
      first.ledgerEntry.id === second.ledgerEntry.id &&
      after.runs.length === 1 &&
      after.ledger.length === 1 &&
      after.audit.length === first.audit.length &&
      after.runs[0]?.run_id === TEST_RUN_ID &&
      after.ledger[0]?.id === first.ledgerEntry.id &&
      after.audit.every((row, index) => row.id === first.audit[index]?.id);

    const pass =
      first.executionPolicy === 'OBSERVATIONAL_ONLY' &&
      second.executionPolicy === 'OBSERVATIONAL_ONLY' &&
      first.auditIntegrity.valid &&
      second.auditIntegrity.valid &&
      auditIntegrity.valid &&
      after.runs.length === 1 &&
      after.ledger.length === 1 &&
      after.audit.length === 6 &&
      idempotent;

    return json(res, pass ? 200 : 500, {
      status: pass ? 'PASS' : 'FAIL',
      e2e: 'CORE_ENGINE_PERSISTENCE',
      runId: TEST_RUN_ID,
      packetId: first.packet.id,
      ledgerId: first.ledgerEntry.id,
      checks: {
        persistenceConfigured: true,
        engineRun: true,
        runPersisted: after.runs.length === 1,
        ledgerPersisted: after.ledger.length === 1,
        auditPersisted: after.audit.length === 6,
        persistedAuditChainValid: auditIntegrity.valid,
        returnedAuditChainValid: first.auditIntegrity.valid && second.auditIntegrity.valid,
        idempotency: idempotent,
        observationalOnly: first.executionPolicy === 'OBSERVATIONAL_ONLY',
        deterministicIdsStable: first.runId === second.runId && first.packet.id === second.packet.id && first.ledgerEntry.id === second.ledgerEntry.id,
        preExistingRows: {
          runs: before.runs.length,
          ledger: before.ledger.length,
          audit: before.audit.length,
        },
      },
      calibration: first.calibration,
      note: 'Synthetic deterministic E2E record. No monetary execution is performed.',
    });
  } catch (error) {
    return json(res, 500, {
      status: 'FAIL',
      e2e: 'CORE_ENGINE_PERSISTENCE',
      error: error instanceof Error ? error.message : 'E2E_FAILED',
    });
  }
}
