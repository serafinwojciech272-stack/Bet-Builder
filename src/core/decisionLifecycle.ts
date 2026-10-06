export const DECISION_STAGES = ['DISCOVER','UNDERSTAND','ANALYZE','BUILD','VERIFY','APPROVE','EXECUTE','OUTCOME','LEARN'] as const;
export type DecisionStage = typeof DECISION_STAGES[number];

export const TERMINAL_STAGES: DecisionStage[] = ['OUTCOME','LEARN'];

const NEXT: Record<DecisionStage, DecisionStage[]> = {
  DISCOVER:['UNDERSTAND'],
  UNDERSTAND:['ANALYZE'],
  ANALYZE:['BUILD'],
  BUILD:['VERIFY'],
  VERIFY:['APPROVE'],
  APPROVE:['EXECUTE'],
  EXECUTE:['OUTCOME'],
  OUTCOME:['LEARN'],
  LEARN:[],
};

export function canTransition(from: DecisionStage, to: DecisionStage): boolean {
  return NEXT[from].includes(to);
}

export function stageIndex(stage: DecisionStage): number {
  return DECISION_STAGES.indexOf(stage);
}

export function isGate(stage: DecisionStage): boolean {
  return stage === 'APPROVE';
}

export function executionPermitted(stage: DecisionStage, humanApproved: boolean, observationalOnly: boolean): boolean {
  return stage === 'APPROVE' && humanApproved && !observationalOnly;
}

export function decisionLabel(stage: DecisionStage): string {
  return {
    DISCOVER:'Discover', UNDERSTAND:'Understand', ANALYZE:'Analyze', BUILD:'Build',
    VERIFY:'Verify', APPROVE:'Human Approval', EXECUTE:'Execute', OUTCOME:'Outcome', LEARN:'Learn',
  }[stage];
}
