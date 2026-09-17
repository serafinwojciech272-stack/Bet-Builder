import { useMemo, useState, useCallback } from 'react';
import type { Selection } from '../domain/types';

export interface BuilderState {
  selections: Selection[];
  stake: number;
}

export function useBuilder() {
  const [selections, setSelections] = useState<Selection[]>([]);
  const [stake, setStake] = useState<number>(25);

  const add = useCallback((sel: Selection) => {
    setSelections((prev) => (prev.some((p) => p.id === sel.id) ? prev : [...prev, sel]));
  }, []);

  const remove = useCallback((id: string) => {
    setSelections((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const clear = useCallback(() => setSelections([]), []);

  const updateStake = useCallback((v: number) => {
    setStake(Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : 0);
  }, []);

  return useMemo(
    () => ({ selections, stake, add, remove, clear, updateStake }),
    [selections, stake, add, remove, clear, updateStake],
  );
}
