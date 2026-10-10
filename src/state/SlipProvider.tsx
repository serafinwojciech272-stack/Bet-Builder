import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/** A hand-picked outcome on the user's slip (one per event). */
export interface SlipPick {
  eventId: string;
  selectionId: string;
  label: string;
  odds: number;
  bookmaker: string;
  eventLabel: string;
  league: string;
  startTime: string;
  /** Consensus (fair) probability at the time of picking. */
  probability: number;
}

export interface SavedCouponLeg {
  eventId: string; selectionId: string; eventLabel: string; league: string; startTime: string;
  label: string; odds: number; bookmaker: string; probability: number;
}

export interface SavedCoupon {
  id: string;
  savedAt: string;
  stake: number;
  combinedOdds: number;
  targetOdds: number;
  probability: number;
  ev: number;
  legs: SavedCouponLeg[];
}

interface SlipValue {
  picks: SlipPick[];
  combinedOdds: number;
  has: (selectionId: string) => boolean;
  toggle: (pick: SlipPick) => 'added' | 'removed' | 'replaced';
  remove: (eventId: string) => void;
  clear: () => void;
  saved: SavedCoupon[];
  save: (coupon: Omit<SavedCoupon, 'id' | 'savedAt'>) => SavedCoupon;
  deleteSaved: (id: string) => void;
}

const SlipContext = createContext<SlipValue | null>(null);
const PICKS_KEY = 'bb-slip-v1';
const SAVED_KEY = 'bb-saved-coupons-v1';
const MAX_SAVED = 50;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): void {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: keep in memory */ }
}

export function SlipProvider({ children }: { children: ReactNode }) {
  const [picks, setPicks] = useState<SlipPick[]>(() => read<SlipPick[]>(PICKS_KEY, []));
  const [saved, setSaved] = useState<SavedCoupon[]>(() => read<SavedCoupon[]>(SAVED_KEY, []));

  useEffect(() => { write(PICKS_KEY, picks); }, [picks]);
  useEffect(() => { write(SAVED_KEY, saved); }, [saved]);

  const has = useCallback((selectionId: string) => picks.some((p) => p.selectionId === selectionId), [picks]);

  const toggle = useCallback((pick: SlipPick): 'added' | 'removed' | 'replaced' => {
    const outcome = picks.some((p) => p.selectionId === pick.selectionId)
      ? 'removed'
      : picks.some((p) => p.eventId === pick.eventId) ? 'replaced' : 'added';
    setPicks((current) => {
      if (current.some((p) => p.selectionId === pick.selectionId)) return current.filter((p) => p.selectionId !== pick.selectionId);
      if (current.some((p) => p.eventId === pick.eventId)) return current.map((p) => (p.eventId === pick.eventId ? pick : p));
      return [...current, pick];
    });
    return outcome;
  }, [picks]);

  const remove = useCallback((eventId: string) => setPicks((c) => c.filter((p) => p.eventId !== eventId)), []);
  const clear = useCallback(() => setPicks([]), []);

  const save = useCallback((coupon: Omit<SavedCoupon, 'id' | 'savedAt'>) => {
    const entry: SavedCoupon = { ...coupon, id: `C-${Date.now().toString(36)}`, savedAt: new Date().toISOString() };
    setSaved((c) => [entry, ...c].slice(0, MAX_SAVED));
    return entry;
  }, []);
  const deleteSaved = useCallback((id: string) => setSaved((c) => c.filter((x) => x.id !== id)), []);

  const value = useMemo<SlipValue>(() => ({
    picks,
    combinedOdds: picks.reduce((o, p) => o * p.odds, 1),
    has, toggle, remove, clear, saved, save, deleteSaved,
  }), [picks, has, toggle, remove, clear, saved, save, deleteSaved]);

  return <SlipContext.Provider value={value}>{children}</SlipContext.Provider>;
}

export function useSlip(): SlipValue {
  const ctx = useContext(SlipContext);
  if (!ctx) throw new Error('useSlip must be used inside SlipProvider');
  return ctx;
}
