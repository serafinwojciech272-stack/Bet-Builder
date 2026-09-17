import type { DeterministicNumber, DomainServiceId, NumericUnit } from './types';

const formatters: Record<NumericUnit, (v: number) => string> = {
  probability: (v) => `${(v * 100).toFixed(1)}%`,
  percent: (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`,
  'decimal-odds': (v) => v.toFixed(2),
  ratio: (v) => v.toFixed(3),
  count: (v) => `${Math.round(v)}`,
  minutes: (v) => `${Math.round(v)}m`,
  score: (v) => v.toFixed(0),
};

/**
 * The only factory able to create a number consumable by the intelligence layer.
 * Callers must be deterministic domain services.
 */
export function det(
  value: number,
  unit: NumericUnit,
  serviceId: DomainServiceId,
): DeterministicNumber {
  const safe = Number.isFinite(value) ? value : 0;
  return {
    value: safe,
    unit,
    serviceId,
    provenance: 'deterministic',
    formatted: formatters[unit](safe),
  };
}

export function isDeterministicNumber(v: unknown): v is DeterministicNumber {
  if (!v || typeof v !== 'object') return false;
  const n = v as Partial<DeterministicNumber>;
  return (
    typeof n.value === 'number' &&
    Number.isFinite(n.value) &&
    typeof n.serviceId === 'string' &&
    n.provenance === 'deterministic' &&
    typeof n.formatted === 'string'
  );
}

/** Walks any structure and collects numbers that are not deterministically tagged. */
export function findUntaggedNumbers(node: unknown, path = '$'): string[] {
  const offenders: string[] = [];
  const visit = (value: unknown, at: string) => {
    if (typeof value === 'number') {
      offenders.push(at);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, i) => visit(item, `${at}[${i}]`));
      return;
    }
    if (value && typeof value === 'object') {
      if (isDeterministicNumber(value)) return;
      for (const [k, v] of Object.entries(value)) visit(v, `${at}.${k}`);
    }
  };
  visit(node, path);
  return offenders;
}
