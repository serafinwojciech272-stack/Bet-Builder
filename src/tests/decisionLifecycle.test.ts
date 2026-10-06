import { describe, expect, it } from 'vitest';
import {
  CORE_ENGINE_STAGES,
  DECISION_STAGES,
  canCoreTransition,
  canTransition,
  coreStageFor,
  executionPermitted,
  isGate,
  stageIndex,
  TERMINAL_STAGES,
} from '../core/decisionLifecycle';

describe('decision lifecycle integrity M43', () => {
  it('keeps the canonical Core Engine eleven-stage contract', () => {
    expect(CORE_ENGINE_STAGES).toEqual([
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
    ]);
  });

  it('keeps the compact product nine-stage spine mapped to Core Engine semantics', () => {
    expect(DECISION_STAGES).toEqual([
      'DISCOVER',
      'UNDERSTAND',
      'ANALYZE',
      'BUILD',
      'VERIFY',
      'APPROVE',
      'EXECUTE',
      'OUTCOME',
      'LEARN',
    ]);
    expect(DECISION_STAGES.map(coreStageFor)).toEqual([
      'CONTEXT',
      'INTELLIGENCE',
      'DECISION',
      'MISSION',
      'RISK_POLICY',
      'APPROVAL',
      'EXECUTION',
      'OUTCOME',
      'LEARNING',
    ]);
  });

  it('allows only adjacent forward transitions in both state contracts', () => {
    for (let i = 0; i < DECISION_STAGES.length - 1; i += 1) {
      expect(canTransition(DECISION_STAGES[i], DECISION_STAGES[i + 1])).toBe(true);
    }
    for (let i = 0; i < CORE_ENGINE_STAGES.length - 1; i += 1) {
      expect(canCoreTransition(CORE_ENGINE_STAGES[i], CORE_ENGINE_STAGES[i + 1])).toBe(true);
    }
    expect(canTransition('DISCOVER', 'EXECUTE')).toBe(false);
    expect(canTransition('VERIFY', 'LEARN')).toBe(false);
    expect(canCoreTransition('CONTEXT', 'EXECUTION')).toBe(false);
    expect(canCoreTransition('APPROVAL', 'EXECUTION')).toBe(false);
  });

  it('keeps Outcome non-terminal until Learning/Memory', () => {
    expect(TERMINAL_STAGES).toEqual(['LEARN']);
    expect(canTransition('OUTCOME', 'LEARN')).toBe(true);
  });

  it('separates human approval from execution permission', () => {
    expect(isGate('APPROVE')).toBe(true);
    expect(executionPermitted('VERIFY', true, false, true)).toBe(false);
    expect(executionPermitted('APPROVE', true, false, true)).toBe(false);
    expect(executionPermitted('EXECUTE', false, false, true)).toBe(false);
    expect(executionPermitted('EXECUTE', true, true, true)).toBe(false);
    expect(executionPermitted('EXECUTE', true, false, false)).toBe(false);
    expect(executionPermitted('EXECUTE', true, false, true)).toBe(true);
  });

  it('returns deterministic stage indexes', () => {
    expect(stageIndex('LEARN')).toBe(8);
  });
});
