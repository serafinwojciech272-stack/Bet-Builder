export type AuditEventType =
  | 'ENGINE_RUN_STARTED'
  | 'DECISION_EVALUATED'
  | 'CONTROL_EVALUATED'
  | 'PACKET_CREATED'
  | 'LEDGER_RECORDED'
  | 'SETTLEMENT_RECORDED'
  | 'LEARNING_EVALUATED';

export interface AuditEvent {
  id: string;
  runId: string;
  type: AuditEventType;
  at: string;
  actor: 'CORE_ENGINE' | 'SYSTEM' | 'OPERATOR';
  payloadDigest: string;
  previousHash: string | null;
  hash: string;
}

const digest = (value: unknown): string => {
  const input = JSON.stringify(value);
  let hash = 2166136261;
  for (const char of input) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

export function appendAuditEvent(
  events: AuditEvent[],
  input: Omit<AuditEvent, 'id' | 'previousHash' | 'hash'>,
): AuditEvent {
  const previousHash = events.at(-1)?.hash ?? null;
  const event = {
    ...input,
    id: `${input.runId}-${events.length + 1}`,
    previousHash,
    hash: digest({ ...input, previousHash }),
  };
  events.push(event);
  return event;
}

export function verifyAuditChain(events: AuditEvent[]): { valid: boolean; brokenAt: string | null } {
  let previousHash: string | null = null;
  for (const event of events) {
    const expected = digest({
      id: event.id,
      runId: event.runId,
      type: event.type,
      at: event.at,
      actor: event.actor,
      payloadDigest: event.payloadDigest,
      previousHash,
    });
    if (event.previousHash !== previousHash || event.hash !== expected) {
      return { valid: false, brokenAt: event.id };
    }
    previousHash = event.hash;
  }
  return { valid: true, brokenAt: null };
}

export const digestPayload = digest;
