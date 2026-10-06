export type OpportunityStatus = 'DETECTED' | 'DISMISSED' | 'SELECTED';

export type DecisionPolicyState = 'CLEAR' | 'REVIEW' | 'BLOCKED';

export type EvidenceRef = {
  id: string;
  kind: 'LIVE' | 'MODEL' | 'HUMAN' | 'HISTORICAL';
  confidence: number;
  fresh: boolean;
};

export type OpportunitySignal = {
  id: string;
  eventId: string;
  status: OpportunityStatus;
  edgePct: number;
  qualityScore: number;
  evidence: EvidenceRef[];
  detectedAt: string;
};

export type DecisionPacket = {
  opportunityId: string;
  eventId: string;
  action: 'REVIEW' | 'BUILD_MISSION' | 'REJECT';
  rationale: string;
  evidenceIds: string[];
  policy: DecisionPolicyState;
};

export function opportunityIsActionable(opportunity: OpportunitySignal): boolean {
  return (
    opportunity.status === 'DETECTED' &&
    opportunity.evidence.length > 0 &&
    opportunity.evidence.every((item) => item.confidence >= 0 && item.confidence <= 100)
  );
}

export function buildDecisionPacket(
  opportunity: OpportunitySignal,
  action: DecisionPacket['action'],
  policy: DecisionPolicyState,
  rationale: string,
): DecisionPacket | null {
  if (!opportunityIsActionable(opportunity)) return null;

  return {
    opportunityId: opportunity.id,
    eventId: opportunity.eventId,
    action,
    rationale,
    evidenceIds: opportunity.evidence.map((item) => item.id),
    policy,
  };
}

export function decisionMayCreateMission(packet: DecisionPacket): boolean {
  return packet.action === 'BUILD_MISSION' && packet.policy !== 'BLOCKED' && packet.evidenceIds.length > 0;
}
