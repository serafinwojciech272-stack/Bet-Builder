import { describe, it, expect } from 'vitest';
import {
  impliedProbability,
  modelEv,
  valueOver,
  combinedOdds,
  potentialReturn,
  potentialProfit,
  estimatedEv,
  riskForOdds,
  oddsMovement,
  movementPercent,
} from './calcs';
import { buildSelection } from '../data/demoData';

describe('implied probability', () => {
  it('computes 1/odds', () => {
    expect(impliedProbability(2)).toBeCloseTo(0.5);
    expect(impliedProbability(4)).toBeCloseTo(0.25);
    expect(impliedProbability(1.5)).toBeCloseTo(2 / 3);
  });
  it('clamps odds <= 1', () => {
    expect(impliedProbability(1)).toBe(1);
  });
});

describe('EV', () => {
  it('EV = prob*odds - 1', () => {
    expect(modelEv(0.6, 2)).toBeCloseTo(0.2);
    expect(modelEv(0.5, 2)).toBeCloseTo(0);
  });
  it('value = prob - implied', () => {
    expect(valueOver(0.6, 2)).toBeCloseTo(0.1);
  });
});

describe('builder math', () => {
  const s1 = buildSelection('a', 'm', 'e', 'A', 'A', 2);
  const s2 = buildSelection('b', 'm', 'e', 'B', 'B', 3);
  it('combined odds multiplies', () => {
    expect(combinedOdds([2, 3, 1.5])).toBeCloseTo(9);
    expect(combinedOdds([])).toBe(1);
  });
  it('potential return / profit', () => {
    expect(potentialReturn(10, 3)).toBeCloseTo(30);
    expect(potentialProfit(10, 3)).toBeCloseTo(20);
  });
  it('estimated EV uses joint probability', () => {
    const ev = estimatedEv([s1, s2]);
    // joint = s1.p * s2.p, multi = 6
    expect(ev).toBeCloseTo(s1.probability * s2.probability * 6 - 1);
  });
});

describe('risk', () => {
  it('buckets', () => {
    expect(riskForOdds(1.5)).toBe('LOW');
    expect(riskForOdds(2)).toBe('MEDIUM');
    expect(riskForOdds(3)).toBe('HIGH');
    expect(riskForOdds(5)).toBe('CRITICAL');
  });
});

describe('odds movement', () => {
  it('direction', () => {
    expect(oddsMovement(2, 2.2)).toBe('UP');
    expect(oddsMovement(2, 1.8)).toBe('DOWN');
    expect(oddsMovement(2, 2.005)).toBe('STABLE');
  });
  it('percent', () => {
    expect(movementPercent(2, 2.1)).toBeCloseTo(5);
  });
});
