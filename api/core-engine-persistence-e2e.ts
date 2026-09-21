import { authenticateSupabaseUser, authorizedByInternalToken, bearerToken } from './auth.js';
import type { Selection } from '../src/domain/types.js';
import { runCoreEngineV1 } from '../src/core/coreEngineV1.js';
import { settleLedgerEntry } from '../src/core/decisionLedger.js';
import { appendAuditEvent, digestPayload, verifyAuditChain, type AuditEvent } from '../src/core/auditTrail.js';
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

async function authorized(req: E2ERequest, url: string, serviceRoleKey: string): Promise<{ ok: boolean; authMode: 'INTERNAL_E2E' | 'SUPABASE_USER' | 'NONE'; userId?: string }> {
  const expected = process.env.CORE_ENGINE_E2E_TOKEN?.trim() ?? '';
  if (expected && authorizedByInternalToken(req, expected)) return { ok: true, authMode: 'INTERNAL_E2E' };
  const user = await authenticateSupabaseUser(req, url, serviceRoleKey);
  if (user) return { ok: true, authMode: 'SUPABASE_USER', userId: user.id };
  return { ok: false, authMode: 'NONE' };
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
  if (req.method !== 'POST') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });

  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return json(res, 503, { error: 'CORE_ENGINE_PERSISTENCE_NOT_CONFIGURED' });

  const authorization = await authorized(req, url, key);
  if (!authorization.ok) return json(res, 401, { error: 'UNAUTHORIZED' });
  const authMode = authorization.authMode;
  let rlsProbe: { applicable: boolean; enforced: boolean; httpStatus: number | null; visibleRows: number | null } = {
    applicable: false,
    enforced: false,
    httpStatus: null,
    visibleRows: null,
  };
  if (authMode === 'SUPABASE_USER') {
    const probe = await fetch(
      `${url.replace(/\/$/, '')}/rest/v1/ce_missions?select=id&limit=1`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${bearerToken(req)}`,
        },
      },
    );
    let visibleRows: number | null = null;
    if (probe.ok) {
      const rows = await probe.json() as unknown[];
      visibleRows = rows.length;
    }
    rlsProbe = {
      applicable: true,
      enforced: !probe.ok || visibleRows === 0,
      httpStatus: probe.status,
      visibleRows,
    };
  }

  try {
    const store = createSupabaseCoreEngineLedgerStoreFromEnv();
    if (!store) return json(res, 503, { error: 'CORE_ENGINE_PERSISTENCE_NOT_CONFIGURED' });

    const before = {
      runs: await supabaseRows(url, key, 'bb_decision_runs', `run_id=eq.${encodeURIComponent(TEST_RUN_ID)}&select=run_id,packet_id,audit_valid,calibration_state`),
      ledger: await supabaseRows(url, key, 'bb_decision_ledger', `id=eq.${encodeURIComponent(`LED-DP-${TEST_NOW.getTime()}-e2e-persistence-selection`)}&select=id,decision_packet_id`),
      audit: await supabaseRows(url, key, 'bb_audit_events', `run_id=eq.${encodeURIComponent(TEST_RUN_ID)}&select=id,run_id,event_type,at,actor,payload_digest,previous_hash,hash&order=at.asc,id.asc`),
    };

    const first = await runCoreEngineV1([selection], null, store, TEST_NOW);
    const second = await runCoreEngineV1([selection], null, store, TEST_NOW);


    // Full lifecycle: create -> persist -> approve -> execute(observational) -> measure -> complete -> learn -> audit -> restart/recovery.
    const lifecycleAudit = [...first.audit];
    const lifecycleAt = (offsetMs: number) => new Date(TEST_NOW.getTime() + offsetMs).toISOString();

    appendAuditEvent(lifecycleAudit, {
      runId: TEST_RUN_ID,
      type: 'APPROVAL_RECORDED',
      at: lifecycleAt(1_000),
      actor: 'OPERATOR',
      payloadDigest: digestPayload({ ledgerId: first.ledgerEntry.id, approvalState: 'APPROVED' }),
    });

    let lifecycleLedger = {
      ...first.ledgerEntry,
      approvalState: 'APPROVED',
      missionId: 'E2E-PERSISTENCE-MISSION',
    };
    await store.append(lifecycleLedger);

    appendAuditEvent(lifecycleAudit, {
      runId: TEST_RUN_ID,
      type: 'EXECUTION_RECORDED',
      at: lifecycleAt(2_000),
      actor: 'CORE_ENGINE',
      payloadDigest: digestPayload({ policy: 'OBSERVATIONAL_ONLY', execution: 'SIMULATED_NO_MONEY' }),
    });

    appendAuditEvent(lifecycleAudit, {
      runId: TEST_RUN_ID,
      type: 'MEASUREMENT_RECORDED',
      at: lifecycleAt(3_000),
      actor: 'SYSTEM',
      payloadDigest: digestPayload({ objectiveOutcome: 1, closingOdds: 2.0 }),
    });

    lifecycleLedger = settleLedgerEntry(lifecycleLedger, {
      status: 'WON',
      settledAt: new Date(TEST_NOW.getTime() + 4_000),
      objectiveOutcome: 1,
      closingOdds: 2.0,
    });
    await store.append(lifecycleLedger);

    appendAuditEvent(lifecycleAudit, {
      runId: TEST_RUN_ID,
      type: 'SETTLEMENT_RECORDED',
      at: lifecycleAt(4_000),
      actor: 'SYSTEM',
      payloadDigest: digestPayload({ status: lifecycleLedger.settlement.status, settledAt: lifecycleLedger.settlement.settledAt }),
    });

    appendAuditEvent(lifecycleAudit, {
      runId: TEST_RUN_ID,
      type: 'COMPLETION_RECORDED',
      at: lifecycleAt(5_000),
      actor: 'SYSTEM',
      payloadDigest: digestPayload({ state: 'COMPLETED', ledgerId: lifecycleLedger.id }),
    });

    appendAuditEvent(lifecycleAudit, {
      runId: TEST_RUN_ID,
      type: 'LEARNING_EVALUATED',
      at: lifecycleAt(6_000),
      actor: 'CORE_ENGINE',
      payloadDigest: digestPayload({ feedback: lifecycleLedger.learning.feedback, lesson: lifecycleLedger.learning.lesson }),
    });

    await store.persistAudit?.(lifecycleAudit);

    // Restart/recovery: reconstruct the state from durable Supabase rows using a fresh store instance.
    const recoveryStore = createSupabaseCoreEngineLedgerStoreFromEnv();
    if (!recoveryStore) throw new Error('CORE_ENGINE_PERSISTENCE_NOT_CONFIGURED');
    const recoveredLedger = (await recoveryStore.list()).find((entry) => entry.id === lifecycleLedger.id);
    const recoveredAudit = await supabaseRows(url, key, 'bb_audit_events', `run_id=eq.${encodeURIComponent(TEST_RUN_ID)}&select=id,run_id,event_type,at,actor,payload_digest,previous_hash,hash&order=at.asc,id.asc`);
    const recoveredAuditEvents = recoveredAudit.map((row) => ({
      id: String(row.id),
      runId: String(row.run_id),
      type: row.event_type as AuditEvent['type'],
      at: String(row.at),
      actor: row.actor as AuditEvent['actor'],
      payloadDigest: String(row.payload_digest),
      previousHash: row.previous_hash === null ? null : String(row.previous_hash),
      hash: String(row.hash),
    }));
    const recoveredIntegrity = verifyAuditChain(recoveredAuditEvents);

    appendAuditEvent(lifecycleAudit, {
      runId: TEST_RUN_ID,
      type: 'RECOVERY_VERIFIED',
      at: lifecycleAt(7_000),
      actor: 'SYSTEM',
      payloadDigest: digestPayload({
        recoveredLedgerId: recoveredLedger?.id ?? null,
        approvalState: recoveredLedger?.approvalState ?? null,
        settlement: recoveredLedger?.settlement.status ?? null,
        learning: recoveredLedger?.learning.feedback ?? null,
        auditValid: recoveredIntegrity.valid,
      }),
    });
    await store.persistAudit?.(lifecycleAudit);

    const after = {
      runs: await supabaseRows(url, key, 'bb_decision_runs', `run_id=eq.${encodeURIComponent(TEST_RUN_ID)}&select=run_id,packet_id,audit_valid,calibration_state`),
      ledger: await supabaseRows(url, key, 'bb_decision_ledger', `id=eq.${encodeURIComponent(first.ledgerEntry.id)}&select=id,decision_packet_id,status`),
      audit: await supabaseRows(url, key, 'bb_audit_events', `run_id=eq.${encodeURIComponent(TEST_RUN_ID)}&select=id,run_id,event_type,at,actor,payload_digest,previous_hash,hash&order=at.asc,id.asc`),
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

    const lifecycleComplete =
      lifecycleLedger.approvalState === 'APPROVED' &&
      lifecycleLedger.settlement.status === 'WON' &&
      lifecycleLedger.settlement.objectiveOutcome === 1 &&
      lifecycleLedger.clv.measured &&
      lifecycleLedger.learning.feedback === 'POSITIVE' &&
      recoveredLedger?.id === lifecycleLedger.id &&
      recoveredLedger.approvalState === 'APPROVED' &&
      recoveredLedger.settlement.status === 'WON' &&
      recoveredLedger.learning.feedback === 'POSITIVE' &&
      recoveredIntegrity.valid;

    const idempotent =
      first.runId === TEST_RUN_ID &&
      second.runId === TEST_RUN_ID &&
      first.packet.id === second.packet.id &&
      first.ledgerEntry.id === second.ledgerEntry.id &&
      after.runs.length === 1 &&
      after.ledger.length === 1 &&
      after.audit.length === 13 &&
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
      after.audit.length === 13 &&
      lifecycleComplete &&
      recoveredAuditEvents.length === 13 &&
      recoveredIntegrity.valid &&
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
        auditPersisted: after.audit.length === 13,
        lifecycleComplete,
        restartRecovery: recoveredLedger?.id === lifecycleLedger.id && recoveredIntegrity.valid,
        persistedAuditChainValid: auditIntegrity.valid,
        returnedAuditChainValid: first.auditIntegrity.valid && second.auditIntegrity.valid,
        idempotency: idempotent,
        observationalOnly: first.executionPolicy === 'OBSERVATIONAL_ONLY',
        authentication: authMode,
        authenticatedUserId: authorization.userId ?? null,
        rlsProbe,
        deterministicIdsStable: first.runId === second.runId && first.packet.id === second.packet.id && first.ledgerEntry.id === second.ledgerEntry.id,
        preExistingRows: {
          runs: before.runs.length,
          ledger: before.ledger.length,
          audit: before.audit.length,
        },
      },
      calibration: first.calibration,
      lifecycle: ['create', 'persist', 'approve', 'execute_observational_only', 'measure', 'complete', 'learn', 'audit', 'restart_recovery'],
      note: 'Synthetic deterministic E2E lifecycle. Execution is observational only; no monetary execution is performed. Supabase bearer authentication is accepted for authenticated operator verification; internal E2E token remains available for trusted automation.',
    });
  } catch (error) {
    return json(res, 500, {
      status: 'FAIL',
      e2e: 'CORE_ENGINE_PERSISTENCE',
      error: error instanceof Error ? error.message : 'E2E_FAILED',
    });
  }
}
