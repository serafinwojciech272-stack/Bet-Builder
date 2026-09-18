import { describe, expect, it } from 'vitest';
import { createDecisionPacket } from '../core/decisionPacket';
import { calibrateLedger, createLedgerEntry, settleLedgerEntry } from '../core/decisionLedger';

const packet = createDecisionPacket({
  status: 'READY', combinedOdds: 2, baseProbability: 0.55, adjustedProbability: 0.52, ev: 0.04,
  dependencyMultiplier: 0.96, correlationRisk: 0.1, concentrationRisk: 0.4, confidence: 0.8, quality: 0.9,
  legDecisions: [], blockers: [], warnings: [], strengths: [], trace: ['decision-center'],
  marketQuality: { score: 0.9, grade: 'A' as const, confidence: 0.8, coverage: 0.8, integrity: 1, depth: 0.8, freshness: 0.9, reasons: [] },
}, [{ id: 'sel-1', eventId: 'EVT-1', marketId: 'h2h', odds: 2, probability: 0.52, confidence: 0.8, risk: 'LOW', correlationGroup: 'EVT-1' }], null, new Date('2026-09-18T00:00:00.000Z'));

describe('Decision Ledger lifecycle', () => {
  it('persists immutable packet identity and evidence', () => {
    const entry = createLedgerEntry(packet, { approvalState: 'APPROVED', missionId: 'MSN-1' });
    expect(entry.id).toBe('LED-' + packet.id); expect(entry.decisionPacketId).toBe(packet.id);
    expect(entry.selectionIds).toEqual(['sel-1']); expect(entry.settlement.status).toBe('PENDING');
  });
  it('settles once, calculates CLV and calibration, then emits learning feedback', () => {
    const entry = createLedgerEntry(packet);
    const settled = settleLedgerEntry(entry, { status: 'WON', objectiveOutcome: 1, closingOdds: 1.8 });
    expect(settled.clv.valuePct).toBeCloseTo((1 / 1.8 - 1 / 2) * 100, 6);
    expect(settled.calibration.brierScore).toBeCloseTo((0.52 - 1) ** 2, 8);
    expect(settled.learning.feedback).toBe('POSITIVE');
    expect(() => settleLedgerEntry(settled, { status: 'LOST', objectiveOutcome: 0 })).toThrow(/LEDGER_ALREADY_SETTLED/);
  });
  it('aggregates only resolved calibration samples', () => {
    const first = settleLedgerEntry(createLedgerEntry(packet), { status: 'WON', objectiveOutcome: 1, closingOdds: 1.8 });
    const second = settleLedgerEntry(createLedgerEntry(packet), { status: 'LOST', objectiveOutcome: 0, closingOdds: 2.2 });
    const summary = calibrateLedger([first, second, createLedgerEntry(packet)]);
    expect(summary.sampleSize).toBe(3); expect(summary.resolvedCount).toBe(2);
    expect(summary.meanBrierScore).not.toBeNull(); expect(summary.meanLogLoss).not.toBeNull();
    expect(summary.meanClvPct).not.toBeNull(); expect(summary.positiveClvRate).toBeGreaterThanOrEqual(0);
  });
});