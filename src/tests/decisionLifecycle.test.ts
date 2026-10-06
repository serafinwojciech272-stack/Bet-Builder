import { describe, expect, it } from 'vitest';
import { DECISION_STAGES, canTransition, executionPermitted, isGate, stageIndex } from '../core/decisionLifecycle';

describe('decision lifecycle integrity M25-M42',()=>{
  it('keeps the canonical nine-stage spine',()=>{
    expect(DECISION_STAGES).toEqual(['DISCOVER','UNDERSTAND','ANALYZE','BUILD','VERIFY','APPROVE','EXECUTE','OUTCOME','LEARN']);
  });
  it('allows only adjacent forward transitions',()=>{
    for(let i=0;i<DECISION_STAGES.length-1;i++) expect(canTransition(DECISION_STAGES[i],DECISION_STAGES[i+1])).toBe(true);
    expect(canTransition('DISCOVER','EXECUTE')).toBe(false);
    expect(canTransition('VERIFY','LEARN')).toBe(false);
  });
  it('protects the approval gate and execution permission',()=>{
    expect(isGate('APPROVE')).toBe(true);
    expect(executionPermitted('VERIFY',true,false)).toBe(false);
    expect(executionPermitted('APPROVE',false,false)).toBe(false);
    expect(executionPermitted('APPROVE',true,true)).toBe(false);
    expect(executionPermitted('APPROVE',true,false)).toBe(true);
  });
  it('returns deterministic stage indexes',()=>expect(stageIndex('LEARN')).toBe(8));
});
