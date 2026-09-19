import { describe, expect, it } from 'vitest';
import { runCoreEngineV1, InMemoryCoreEngineLedgerStore } from './coreEngineV1';
import type { Selection } from '../domain/types';

const selection: Selection = {
  id: 'test-selection',
  marketId: 'match-winner',
  eventId: 'event-1',
  name: 'Home',
  shortName: 'Home',
  odds: 2.1,
  probability: 0.52,
  impliedProbability: 1 / 2.1,
  value: 0.52 - 1 / 2.1,
  ev: 0.52 * 2.1 - 1,
  confidence: 0.78,
  risk: 'LOW',
  correlationGroup: 'event:event-1',
  dataFreshness: 0.96,
  bookmakerDepth: 4,
};

describe('Core Engine 1.0', () => {
  it('creates an auditable decision packet and ledger entry without enabling monetary execution', async () => {
    const store = new InMemoryCoreEngineLedgerStore();
    const run = await runCoreEngineV1([selection], null, store, new Date('2026-09-19T12:00:00.000Z'));

    expect(run.version).toBe('1.0.0');
    expect(run.executionPolicy).toBe('OBSERVATIONAL_ONLY');
    expect(run.packet.id).toContain('DP-');
    expect(run.ledgerEntry.id).toContain('LED-');
    expect(run.auditIntegrity.valid).toBe(true);
    expect(run.audit.length).toBeGreaterThanOrEqual(5);
    expect((await store.list())).toHaveLength(1);
    expect(run.calibration.state).toBe('INSUFFICIENT_SAMPLE');
  });

  it('is idempotent at the ledger boundary', async () => {
    const store = new InMemoryCoreEngineLedgerStore();
    const first = await runCoreEngineV1([selection], null, store, new Date('2026-09-19T12:00:00.000Z'));
    const second = await runCoreEngineV1([selection], null, store, new Date('2026-09-19T12:00:00.000Z'));

    expect(first.ledgerEntry.id).toBe(second.ledgerEntry.id);
    expect((await store.list())).toHaveLength(1);
  });
});
