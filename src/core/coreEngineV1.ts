import type { Selection } from '../domain/types.js';
import type { EventResearch } from '../research/types.js';
import { orchestrateDecision, type DecisionOrchestratorResult } from './decisionOrchestrator.js';
import { createDecisionPacket, type DecisionPacket } from './decisionPacket.js';
import { createLedgerEntry, type DecisionLedgerEntry } from './decisionLedger.js';
import { evaluateCalibrationLoop, type CalibrationLoopResult } from './calibrationLoop.js';
import { appendAuditEvent, digestPayload, type AuditEvent, verifyAuditChain } from './auditTrail.js';

export interface CoreEngineRun {
  version: '1.0.0';
  runId: string;
  startedAt: string;
  completedAt: string;
  orchestrator: DecisionOrchestratorResult;
  packet: DecisionPacket;
  ledgerEntry: DecisionLedgerEntry;
  audit: AuditEvent[];
  auditIntegrity: { valid: boolean; brokenAt: string | null };
  calibration: CalibrationLoopResult;
  executionPolicy: 'OBSERVATIONAL_ONLY';
}

export interface CoreEngineLedgerStore {
  append(entry: DecisionLedgerEntry): Promise<void> | void;
  list(): Promise<DecisionLedgerEntry[]> | DecisionLedgerEntry[];
  persistRun?(run: CoreEngineRun): Promise<void> | void;
  persistAudit?(events: AuditEvent[]): Promise<void> | void;
}

export class InMemoryCoreEngineLedgerStore implements CoreEngineLedgerStore {
  private readonly entries: DecisionLedgerEntry[] = [];

  append(entry: DecisionLedgerEntry) {
    if (this.entries.some((item) => item.id === entry.id)) return;
    this.entries.push(structuredClone(entry));
  }

  list() {
    return structuredClone(this.entries);
  }
}

export async function runCoreEngineV1(
  selections: Selection[],
  research: EventResearch | null,
  store: CoreEngineLedgerStore,
  now = new Date(),
): Promise<CoreEngineRun> {
  const runId = `CE1-${now.getTime()}`;
  const startedAt = now.toISOString();
  const audit: AuditEvent[] = [];

  appendAuditEvent(audit, {
    runId,
    type: 'ENGINE_RUN_STARTED',
    at: startedAt,
    actor: 'CORE_ENGINE',
    payloadDigest: digestPayload({ selectionIds: selections.map((selection) => selection.id), research: research?.digest ?? null }),
  });

  const orchestrator = orchestrateDecision(selections, research);
  appendAuditEvent(audit, {
    runId,
    type: 'DECISION_EVALUATED',
    at: new Date().toISOString(),
    actor: 'CORE_ENGINE',
    payloadDigest: digestPayload({ status: orchestrator.decision.status, ev: orchestrator.decision.ev, quality: orchestrator.decision.marketQuality.score }),
  });
  appendAuditEvent(audit, {
    runId,
    type: 'CONTROL_EVALUATED',
    at: new Date().toISOString(),
    actor: 'CORE_ENGINE',
    payloadDigest: digestPayload({ decision: orchestrator.control.decision, hardStops: orchestrator.control.hardStops, reviewFlags: orchestrator.control.reviewFlags }),
  });

  const packetSelections = selections.map((selection) => ({
    id: selection.id,
    eventId: selection.eventId,
    marketId: selection.marketId,
    odds: selection.odds,
    probability: selection.probability,
    confidence: selection.confidence,
    risk: selection.risk,
    correlationGroup: selection.correlationGroup,
  }));
  const packet = createDecisionPacket(
    orchestrator.decision,
    packetSelections,
    null,
    now,
    research,
    orchestrator.evidence,
  );
  appendAuditEvent(audit, {
    runId,
    type: 'PACKET_CREATED',
    at: new Date().toISOString(),
    actor: 'CORE_ENGINE',
    payloadDigest: digestPayload({ packetId: packet.id, status: packet.status, eligible: packet.mission.eligible }),
  });

  const ledgerEntry = createLedgerEntry(packet, { approvalState: 'PENDING', now });
  await store.append(ledgerEntry);
  appendAuditEvent(audit, {
    runId,
    type: 'LEDGER_RECORDED',
    at: new Date().toISOString(),
    actor: 'SYSTEM',
    payloadDigest: digestPayload({ ledgerId: ledgerEntry.id, packetId: packet.id }),
  });

  const calibration = evaluateCalibrationLoop(await store.list());
  appendAuditEvent(audit, {
    runId,
    type: 'LEARNING_EVALUATED',
    at: new Date().toISOString(),
    actor: 'CORE_ENGINE',
    payloadDigest: digestPayload({ state: calibration.state, resolvedCount: calibration.summary.resolvedCount, shrinkage: calibration.recommendedProbabilityShrinkage }),
  });

  const run: CoreEngineRun = {
    version: '1.0.0',
    runId,
    startedAt,
    completedAt: new Date().toISOString(),
    orchestrator,
    packet,
    ledgerEntry,
    audit,
    auditIntegrity: verifyAuditChain(audit),
    calibration,
    executionPolicy: 'OBSERVATIONAL_ONLY',
  };

  if (store.persistRun) await store.persistRun(run);
  if (store.persistAudit) await store.persistAudit(audit);
  return run;
}
