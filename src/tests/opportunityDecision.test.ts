import { describe, expect, it } from 'vitest';
import {
  buildDecisionPacket,
  decisionMayCreateMission,
  opportunityIsActionable,
  type OpportunitySignal,
} from '../core/opportunityDecision';

const opportunity: OpportunitySignal = {
  id: 'opp-1',
  eventId: 'event-1',
  status: 'DETECTED',
  edgePct: 7.2,
  qualityScore: 84,
  detectedAt: '2026-10-06T10:00:00Z',
  evidence: [
    { id: 'live-1', kind: 'LIVE', confidence: 94, fresh: true },
    { id: 'model-1', kind: 'MODEL', confidence: 81, fresh: true },
  ],
};

describe('Opportunity → Decision contract M44', () => {
  it('keeps Opportunity as a typed intelligence result, not an execution stage', () => {
    expect(opportunityIsActionable(opportunity)).toBe(true);
    expect(opportunity.status).toBe('DETECTED');
  });

  it('requires evidence before a decision packet can be created', () => {
    const packet = buildDecisionPacket(opportunity, 'REVIEW', 'REVIEW', 'Signal requires human review.');
    expect(packet).toEqual({
      opportunityId: 'opp-1',
      eventId: 'event-1',
      action: 'REVIEW',
      rationale: 'Signal requires human review.',
      evidenceIds: ['live-1', 'model-1'],
      policy: 'REVIEW',
    });

    expect(buildDecisionPacket({ ...opportunity, evidence: [] }, 'BUILD_MISSION', 'CLEAR', 'No evidence')).toBeNull();
  });

  it('does not bypass policy when a decision requests mission creation', () => {
    const clear = buildDecisionPacket(opportunity, 'BUILD_MISSION', 'CLEAR', 'Qualified signal.');
    const review = buildDecisionPacket(opportunity, 'BUILD_MISSION', 'REVIEW', 'Qualified but gated.');
    const blocked = buildDecisionPacket(opportunity, 'BUILD_MISSION', 'BLOCKED', 'Policy blocked.');

    expect(clear && decisionMayCreateMission(clear)).toBe(true);
    expect(review && decisionMayCreateMission(review)).toBe(true);
    expect(blocked && decisionMayCreateMission(blocked)).toBe(false);
  });

  it('keeps Opportunity independent from human approval and execution permission', () => {
    const packet = buildDecisionPacket(opportunity, 'BUILD_MISSION', 'CLEAR', 'Qualified signal.');
    expect(packet?.action).toBe('BUILD_MISSION');
    expect(packet).not.toHaveProperty('humanApproved');
    expect(packet).not.toHaveProperty('executionPermission');
  });
});
