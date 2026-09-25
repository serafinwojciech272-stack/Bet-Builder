import type { Mission, MissionStatus, MissionTransition } from './types';

export const TRANSITIONS: Record<MissionStatus, MissionStatus[]> = {
  DRAFT: ['AWAITING_APPROVAL', 'CANCELLED'],
  AWAITING_APPROVAL: ['APPROVED', 'DRAFT', 'CANCELLED', 'FAILED'],
  APPROVED: ['EXECUTING', 'CANCELLED'],
  EXECUTING: ['MEASURING', 'FAILED', 'CANCELLED'],
  MEASURING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export const TERMINAL_STATUSES: MissionStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED'];

export interface TransitionContext {
  actor: string;
  reason: string;
  at?: string;
}

export type TransitionGuardCode =
  | 'ILLEGAL_TRANSITION'
  | 'APPROVAL_REQUIRED'
  | 'CHECKLIST_INCOMPLETE'
  | 'APPROVAL_BLOCKED'
  | 'NO_ACTIONS'
  | 'ALREADY_TERMINAL'
  | 'EXECUTION_MISSING'
  | 'MEASUREMENT_MISSING';

export class MissionTransitionError extends Error {
  constructor(
    readonly code: TransitionGuardCode,
    message: string,
  ) {
    super(message);
    this.name = 'MissionTransitionError';
  }
}

export function canTransition(from: MissionStatus, to: MissionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Guards enforced on top of the raw transition table. */
export function assertGuards(mission: Mission, to: MissionStatus): void {
  if (TERMINAL_STATUSES.includes(mission.status)) {
    throw new MissionTransitionError(
      'ALREADY_TERMINAL',
      `Mission ${mission.id} is terminal (${mission.status}) and cannot transition.`,
    );
  }
  if (!canTransition(mission.status, to)) {
    throw new MissionTransitionError(
      'ILLEGAL_TRANSITION',
      `Illegal transition ${mission.status} → ${to}.`,
    );
  }
  if (to === 'AWAITING_APPROVAL' && mission.actions.length === 0) {
    throw new MissionTransitionError(
      'NO_ACTIONS',
      'A mission must define at least one action before requesting approval.',
    );
  }
  if (to === 'APPROVED') {
    if (mission.approval.state !== 'APPROVED') {
      throw new MissionTransitionError(
        'APPROVAL_REQUIRED',
        'Approval gate has not recorded a human approval decision.',
      );
    }
    if (!Array.isArray(mission.approval.checklist)) {
      throw new MissionTransitionError(
        'CHECKLIST_INCOMPLETE',
        'Approval checklist is missing or malformed; the gate cannot be evaluated.',
      );
    }
    const outstanding = mission.approval.checklist.filter((c) => c.required && !c.acknowledged);
    if (outstanding.length) {
      throw new MissionTransitionError(
        'CHECKLIST_INCOMPLETE',
        `${outstanding.length} mandatory approval check(s) not acknowledged.`,
      );
    }
    if (mission.approval.blockers.length) {
      throw new MissionTransitionError(
        'APPROVAL_BLOCKED',
        `Approval blocked: ${mission.approval.blockers.join('; ')}`,
      );
    }
    // An approval state alone is not a decision: a named human approver and a
    // decision timestamp must be recorded, so default/undefined values can never
    // be read as approval.
    if (!mission.approval.decidedBy || !mission.approval.decidedAt) {
      throw new MissionTransitionError(
        'APPROVAL_REQUIRED',
        'Approval gate has no recorded human decision (approver and decision time are required).',
      );
    }
  }
  if (to === 'EXECUTING' && mission.approval.state !== 'APPROVED') {
    throw new MissionTransitionError(
      'APPROVAL_REQUIRED',
      'Execution attempted without an approved mission — blocked by the approval gate.',
    );
  }
  // An approved mission must still carry the human decision that authorised it.
  if (to === 'EXECUTING' && (!mission.approval.decidedBy || !mission.approval.decidedAt)) {
    throw new MissionTransitionError(
      'APPROVAL_REQUIRED',
      'Execution attempted on a mission with no recorded human approval decision.',
    );
  }
  if (to === 'MEASURING' && !mission.execution) {
    throw new MissionTransitionError(
      'EXECUTION_MISSING',
      'Cannot measure a mission that never executed.',
    );
  }
  if (to === 'COMPLETED' && !mission.measurement) {
    throw new MissionTransitionError(
      'MEASUREMENT_MISSING',
      'Cannot complete a mission without a measurement record.',
    );
  }
}

/** Pure transition: returns a new Mission, never mutates the input. */
export function transition(
  mission: Mission,
  to: MissionStatus,
  ctx: TransitionContext,
): Mission {
  assertGuards(mission, to);
  const at = ctx.at ?? new Date().toISOString();
  const entry: MissionTransition = {
    from: mission.status,
    to,
    at,
    actor: ctx.actor,
    reason: ctx.reason,
  };
  return {
    ...mission,
    status: to,
    updatedAt: at,
    history: [...mission.history, entry],
  };
}

export function nextStatuses(mission: Mission): MissionStatus[] {
  return TRANSITIONS[mission.status].filter((to) => {
    try {
      assertGuards(mission, to);
      return true;
    } catch {
      return false;
    }
  });
}
