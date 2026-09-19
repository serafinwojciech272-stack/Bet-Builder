import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runCoreEngineV1 } from '../src/core/coreEngineV1.js';
import { createSupabaseCoreEngineLedgerStoreFromEnv } from '../src/core/supabaseCoreEnginePersistence.js';
import type { Selection } from '../src/domain/types.js';

const TEST_NONCE = 'f091a848f6f7963c4ffca2bd0eee70daa25d0dc8';

const selection: Selection = {
  id: 'E2E-CORE-ENGINE-SELECTION',
  marketId: 'E2E-MARKET',
  eventId: 'E2E-EVENT',
  name: 'E2E observational test',
  shortName: 'E2E',
  odds: 2.1,
  probability: 0.52,
  impliedProbability: 1 / 2.1,
  value: 0.52 - 1 / 2.1,
  ev: 0.52 * 2.1 - 1,
  confidence: 0.78,
  risk: 'LOW',
  correlationGroup: 'E2E-GROUP',
  dataFreshness: 0.96,
  bookmakerDepth: 4,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  if (String(req.query.nonce ?? '') !== TEST_NONCE) return res.status(404).json({ error: 'NOT_FOUND' });

  const store = createSupabaseCoreEngineLedgerStoreFromEnv();
  if (!store) return res.status(503).json({ error: 'CORE_ENGINE_PERSISTENCE_NOT_CONFIGURED' });

  try {
    const run = await runCoreEngineV1([selection], null, store);
    return res.status(200).json({
      ok: true,
      runId: run.runId,
      version: run.version,
      decision: run.orchestrator.decision.status,
      control: run.orchestrator.control.decision,
      packetId: run.packet.id,
      ledgerId: run.ledgerEntry.id,
      auditEvents: run.audit.length,
      auditIntegrity: run.auditIntegrity,
      executionPolicy: run.executionPolicy,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'CORE_ENGINE_SMOKE_FAILED',
    });
  }
}
