import { useMemo, useState, useCallback } from 'react';
import type { Selection } from '../domain/types';

export interface BuilderState {
  selections: Selection[];
  stake: number;
}

/** A selection only enters the slip with legitimate market inputs; invalid prices are never fabricated. */
export function isAdmissibleSelection(sel: Selection): boolean {
  return Number.isFinite(sel.odds) && sel.odds > 1 && Number.isFinite(sel.probability) && sel.probability >= 0 && sel.probability <= 1;
}

export function sanitizeSelections(next: Selection[]): Selection[] {
  const seen = new Set<string>();
  return next.filter((sel) => {
    if (seen.has(sel.id)) return false;
    seen.add(sel.id);
    return isAdmissibleSelection(sel);
  });
}

export function useBuilder() {
  const [selections, setSelections] = useState<Selection[]>([]);
  const [stake, setStake] = useState<number>(25);

  const add = useCallback((sel: Selection) => {
    if (!isAdmissibleSelection(sel)) return;
    setSelections((prev) => (prev.some((p) => p.id === sel.id) ? prev : [...prev, sel]));
  }, []);

  const remove = useCallback((id: string) => {
    setSelections((prev) => prev.filter((p) => p.id !== id));
  }, []);

  /** Replace the slip from an external store, dropping any selection without legitimate market inputs. */
  const replace = useCallback((next: Selection[]) => setSelections(sanitizeSelections(next)), []);

  const clear = useCallback(() => setSelections([]), []);

  const updateStake = useCallback((v: number) => {
    setStake(Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : 0);
  }, []);

  return useMemo(
    () => ({ selections, stake, add, remove, replace, clear, updateStake }),
    [selections, stake, add, remove, replace, clear, updateStake],
  );
}
