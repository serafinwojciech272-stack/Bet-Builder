export const CORE_ENGINE_STAGES = [
  'CONTEXT',
  'INTELLIGENCE',
  'OPPORTUNITY',
  'DECISION',
  'MISSION',
  'RISK_POLICY',
  'APPROVAL',
  'EXECUTION_PERMISSION',
  'EXECUTION',
  'OUTCOME',
  'LEARNING',
] as const;

export type CoreEngineStage = typeof CORE_ENGINE_STAGES[number];

export const DECISION_STAGES = [
  'DISCOVER',
  'UNDERSTAND',
  'ANALYZE',
  'BUILD',
  'VERIFY',
  'APPROVE',
  'EXECUTE',
  'OUTCOME',
  'LEARN',
] as const;

export type DecisionStage = typeof DECISION_STAGES[number];

export const UI_TO_CORE_STAGE: Record<DecisionStage, CoreEngineStage> = {
  DISCOVER: 'CONTEXT',
  UNDERSTAND: 'INTELLIGENCE',
  ANALYZE: 'DECISION',
  BUILD: 'MISSION',
  VERIFY: 'RISK_POLICY',
  APPROVE: 'APPROVAL',
  EXECUTE: 'EXECUTION',
  OUTCOME: 'OUTCOME',
  LEARN: 'LEARNING',
};

export const CORE_STAGE_LABELS: Record<CoreEngineStage, string> = {
  CONTEXT: 'Context',
  INTELLIGENCE: 'Intelligence',
  OPPORTUNITY: 'Opportunity',
  DECISION: 'Decision',
  MISSION: 'Mission',
  RISK_POLICY: 'Risk / Policy',
  APPROVAL: 'Human Approval',
  EXECUTION_PERMISSION: 'Execution Permission',
  EXECUTION: 'Execution',
  OUTCOME: 'Outcome',
  LEARNING: 'Learning / Memory',
};

export const TERMINAL_STAGES: DecisionStage[] = ['LEARN'];
export const TERMINAL_CORE_STAGES: CoreEngineStage[] = ['LEARNING'];

const NEXT: Record<DecisionStage, DecisionStage[]> = {
  DISCOVER: ['UNDERSTAND'],
  UNDERSTAND: ['ANALYZE'],
  ANALYZE: ['BUILD'],
  BUILD: ['VERIFY'],
  VERIFY: ['APPROVE'],
  APPROVE: ['EXECUTE'],
  EXECUTE: ['OUTCOME'],
  OUTCOME: ['LEARN'],
  LEARN: [],
};

const CORE_NEXT: Record<CoreEngineStage, CoreEngineStage[]> = {
  CONTEXT: ['INTELLIGENCE'],
  INTELLIGENCE: ['OPPORTUNITY'],
  OPPORTUNITY: ['DECISION'],
  DECISION: ['MISSION'],
  MISSION: ['RISK_POLICY'],
  RISK_POLICY: ['APPROVAL'],
  APPROVAL: ['EXECUTION_PERMISSION'],
  EXECUTION_PERMISSION: ['EXECUTION'],
  EXECUTION: ['OUTCOME'],
  OUTCOME: ['LEARNING'],
  LEARNING: [],
};

export function canTransition(from: DecisionStage, to: DecisionStage): boolean {
  return NEXT[from].includes(to);
}

export function canCoreTransition(from: CoreEngineStage, to: CoreEngineStage): boolean {
  return CORE_NEXT[from].includes(to);
}

export function stageIndex(stage: DecisionStage): number {
  return DECISION_STAGES.indexOf(stage);
}

export function coreStageIndex(stage: CoreEngineStage): number {
  return CORE_ENGINE_STAGES.indexOf(stage);
}

export function coreStageFor(stage: DecisionStage): CoreEngineStage {
  return UI_TO_CORE_STAGE[stage];
}

export function isGate(stage: DecisionStage): boolean {
  return stage === 'APPROVE';
}

export function isCoreGate(stage: CoreEngineStage): boolean {
  return stage === 'APPROVAL' || stage === 'EXECUTION_PERMISSION';
}

/**
 * Human approval is necessary but is not itself execution permission.
 * Permission requires an explicit Core Engine policy decision.
 */
export function executionPermitted(
  stage: DecisionStage,
  humanApproved: boolean,
  observationalOnly: boolean,
  coreExecutionPermission = false,
): boolean {
  return (
    stage === 'EXECUTE' &&
    humanApproved &&
    coreExecutionPermission &&
    !observationalOnly
  );
}

export function decisionLabel(stage: DecisionStage): string {
  return {
    DISCOVER: 'Discover',
    UNDERSTAND: 'Understand',
    ANALYZE: 'Analyze',
    BUILD: 'Build',
    VERIFY: 'Verify',
    APPROVE: 'Human Approval',
    EXECUTE: 'Execute',
    OUTCOME: 'Outcome',
    LEARN: 'Learn',
  }[stage];
}

export function coreStageLabel(stage: CoreEngineStage): string {
  return CORE_STAGE_LABELS[stage];
}
