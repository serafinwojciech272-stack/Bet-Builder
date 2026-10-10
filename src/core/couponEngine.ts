import type { EventWithMarkets } from '../domain/types';
import { predictSelection, type Prediction } from './predictionEngine';

export type CouponStatus = 'READY' | 'REVIEW' | 'BLOCKED';

/**
 * VALUE_ONLY  – only prices above the de-vigged market consensus (EV > 0).
 * BEST_AVAILABLE – best price per event, may be EV < 0 (bookmaker margin);
 *                  the coupon is honest about it instead of returning nothing.
 */
export type CouponMode = 'VALUE_ONLY' | 'BEST_AVAILABLE';

export interface CouponRequest {
  events: EventWithMarkets[];
  targetOdds: number;
  stake: number;
  tolerance?: number;
  maxLegs?: number;
  minLegOdds?: number;
  maxLegOdds?: number;
  minConfidence?: number;
  mode?: CouponMode;
  /** Lowest EV accepted in BEST_AVAILABLE mode (default −8%, ~typical margin). */
  minEv?: number;
  /** Event ids that must not be used (\"Losuj inny kupon\"). */
  excludeEventIds?: string[];
  /** Selections the user picked by hand; always kept, the engine fills the rest to the target. */
  lockedSelectionIds?: string[];
}

export interface CouponLeg extends Prediction {
  eventLabel: string;
  league: string;
  startTime: string;
  /** Bookmaker offering this price. */
  bookmaker: string;
  /** How many bookmakers price this market (consensus depth). */
  bookmakerCount: number;
  /** One plain-language sentence: why this leg is on the coupon. */
  reason: string;
}

export interface CouponResult {
  status: CouponStatus;
  mode: CouponMode;
  targetOdds: number;
  combinedOdds: number;
  targetReached: boolean;
  /** Relative gap between combined and target odds (−0.03 = 3% below). */
  targetDeviation: number;
  stake: number;
  potentialReturn: number;
  potentialProfit: number;
  estimatedProbability: number;
  estimatedEv: number;
  legs: CouponLeg[];
  /** Candidates eligible after filters (one best price per event). */
  poolSize: number;
  /** Candidates with EV > 0 across the whole dataset. */
  valuePoolSize: number;
  blockers: string[];
  warnings: string[];
  rationale: string[];
}

const finite = (n: number) => Number.isFinite(n);
const BEAM_WIDTH = 120;
/** Outcomes kept per event, so the search can fine-tune the combined odds. */
const OUTCOMES_PER_EVENT = 3;
/** Tolerance tiers: the tightest tier that yields a coupon wins, so payout ≈ stake × target. */
const TOLERANCE_TIERS = [0.03, 0.07, 0.12];

interface Candidate { p: Prediction; e: EventWithMarkets; bookmaker: string; books: number; logOdds: number; logProb: number; }
interface State { legs: Candidate[]; logOdds: number; logProb: number; events: Set<string>; }

/**
 * For a fixed target payout, maximising the joint win probability is the same
 * as maximising EV (EV = P·odds − 1). So: pick a set of independent events
 * (one leg per event) whose combined odds land within tolerance of the target
 * and whose product of fair probabilities is highest. Beam search keeps it
 * deterministic and fast for a few hundred candidates.
 */
function within(logOdds: number, target: number, tolerance: number): boolean {
  return logOdds >= Math.log(target * (1 - tolerance)) && logOdds <= Math.log(target * (1 + tolerance));
}

function search(cands: Candidate[], target: number, tolerance: number, maxLegs: number): State | null {
  const logT = Math.log(target);
  const lo = Math.log(target * (1 - tolerance));
  const hi = Math.log(target * (1 + tolerance));
  let beam: State[] = [{ legs: [], logOdds: 0, logProb: 0, events: new Set() }];
  let best: State | null = null;
  let closest: State | null = null;
  const closer = (s: State) => !closest || Math.abs(s.logOdds - logT) < Math.abs(closest.logOdds - logT);

  for (let depth = 0; depth < maxLegs && beam.length; depth++) {
    const next: State[] = [];
    for (const state of beam) {
      for (const c of cands) {
        if (state.events.has(c.e.id)) continue;
        const logOdds = state.logOdds + c.logOdds;
        if (logOdds > hi) continue;
        const legs = [...state.legs, c];
        // canonical order avoids exploring permutations of the same set
        if (state.legs.length && state.legs[state.legs.length - 1].p.selectionId > c.p.selectionId) continue;
        const s: State = { legs, logOdds, logProb: state.logProb + c.logProb, events: new Set(state.events).add(c.e.id) };
        if (logOdds >= lo) {
          if (!best || s.logProb > best.logProb) best = s;
        } else {
          next.push(s);
        }
        if (closer(s)) closest = s;
      }
    }
    // logProb + logOdds = log(1 + EV) of the partial coupon: keep the best value per odds covered
    next.sort((a, b) => (b.logProb + b.logOdds) - (a.logProb + a.logOdds) || b.logOdds - a.logOdds);
    beam = next.slice(0, BEAM_WIDTH);
  }
  return best ?? closest;
}

export function generateCoupon(input: CouponRequest): CouponResult {
  const mode: CouponMode = input.mode ?? 'BEST_AVAILABLE';
  const target = finite(input.targetOdds) && input.targetOdds > 1 ? input.targetOdds : 0;
  const stake = finite(input.stake) && input.stake >= 0 ? input.stake : 0;
  const tolerance = Math.max(0.01, Math.min(0.5, input.tolerance ?? 0.2));
  const maxLegs = Math.min(12, Math.max(1, Math.floor(input.maxLegs ?? 8)));

  const empty = (blockers: string[], poolSize = 0, valuePoolSize = 0): CouponResult => ({
    status: 'BLOCKED', mode, targetOdds: target, combinedOdds: 0, targetReached: false, targetDeviation: -1, stake,
    potentialReturn: 0, potentialProfit: 0, estimatedProbability: 0, estimatedEv: 0, legs: [],
    poolSize, valuePoolSize, blockers, warnings: [], rationale: [],
  });
  if (!target) return empty(['TARGET_ODDS_INVALID']);

  const locked = resolveSelections(input.events, input.lockedSelectionIds ?? []);
  const lockedOdds = locked.reduce((o, c) => o * c.p.marketOdds, 1);
  const lockedLegs = locked.map(toLeg);
  const lockedEvents = locked.map((c) => c.e.id);
  const { cands, valuePoolSize, eventCount } = buildCandidates(
    { ...input, excludeEventIds: [...(input.excludeEventIds ?? []), ...lockedEvents] }, mode);

  // the hand-picked legs already reach the target (or there is no room left): keep them as they are
  const remainingTarget = target / lockedOdds;
  const room = maxLegs - locked.length;
  if (locked.length && (remainingTarget <= 1 + tolerance || room <= 0 || !cands.length)) {
    return finalize(input, mode, lockedLegs, eventCount, valuePoolSize);
  }
  if (!cands.length) {
    return empty([mode === 'VALUE_ONLY' ? 'NO_VALUE_SELECTIONS' : 'NO_QUALIFIED_SELECTIONS'], 0, valuePoolSize);
  }

  let picked: State | null = null;
  for (const tier of [...TOLERANCE_TIERS.filter((t) => t < tolerance), tolerance]) {
    const attempt = search(cands, remainingTarget, tier, room);
    if (attempt && within(attempt.logOdds, remainingTarget, tier)) { picked = attempt; break; }
    if (attempt && (!picked || Math.abs(attempt.logOdds - Math.log(remainingTarget)) < Math.abs(picked.logOdds - Math.log(remainingTarget)))) picked = attempt;
  }
  return finalize(input, mode, [...lockedLegs, ...(picked?.legs ?? []).map(toLeg)], eventCount, valuePoolSize);
}

function finalize(input: CouponRequest, mode: CouponMode, rawLegs: CouponLeg[], poolSize: number, valuePoolSize: number): CouponResult {
  const target = input.targetOdds;
  const stake = finite(input.stake) && input.stake >= 0 ? input.stake : 0;
  const tolerance = Math.max(0.01, Math.min(0.5, input.tolerance ?? 0.2));
  const legs = [...rawLegs].sort((a, b) => a.startTime.localeCompare(b.startTime));

  const combined = legs.reduce((o, l) => o * l.marketOdds, 1);
  const probability = legs.reduce((p, l) => p * l.probability, 1);
  const ev = legs.length ? combined * probability - 1 : 0;
  const targetReached = legs.length > 0 && combined >= target * (1 - tolerance) && combined <= target * (1 + tolerance);

  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!legs.length) blockers.push('NO_QUALIFIED_SELECTIONS');
  if (stake <= 0) warnings.push('ZERO_STAKE');
  if (legs.length && !targetReached) warnings.push('TARGET_NOT_REACHED');
  if (legs.length && ev < 0) warnings.push('NEGATIVE_EV');

  return {
    status: blockers.length ? 'BLOCKED' : warnings.length ? 'REVIEW' : 'READY',
    mode, targetOdds: target, combinedOdds: legs.length ? combined : 0, targetReached, targetDeviation: legs.length ? combined / target - 1 : -1, stake,
    potentialReturn: stake * (legs.length ? combined : 0),
    potentialProfit: Math.max(0, stake * combined - stake) * (legs.length ? 1 : 0),
    estimatedProbability: legs.length ? probability : 0, estimatedEv: ev, legs,
    poolSize, valuePoolSize, blockers, warnings,
    rationale: [
      `Pula: ${poolSize} wydarzeń po filtrach (${valuePoolSize} typów z EV > 0 w całym feedzie).`,
      `Cel ${target.toFixed(2)} ±${Math.round(tolerance * 100)}% · wynik ${legs.length ? combined.toFixed(2) : '—'}.`,
      `Szansa wg konsensusu rynku ${(probability * 100).toFixed(1)}% · EV ${(ev * 100).toFixed(1)}%.`,
    ],
  };
}

function buildCandidates(input: CouponRequest, mode: CouponMode): { cands: Candidate[]; valuePoolSize: number; eventCount: number } {
  const minLeg = input.minLegOdds ?? 1.2;
  const maxLeg = input.maxLegOdds ?? 10;
  const minEv = mode === 'VALUE_ONLY' ? 1e-9 : (input.minEv ?? -0.08);
  const excluded = new Set(input.excludeEventIds ?? []);
  const all = input.events.flatMap((e) => e.markets.flatMap((m) => {
    const books = new Set(e.markets.filter((x) => x.type === m.type).map((x) => x.category)).size;
    return m.selections.map((s) => ({ p: predictSelection(s), e, bookmaker: m.category, books }));
  }));
  const valuePoolSize = all.filter((c) => c.p.ev > 0 && c.p.risk !== 'CRITICAL').length;

  // up to OUTCOMES_PER_EVENT outcomes per event (best price per outcome, highest EV first);
  // the search still uses at most one leg per event
  const perOutcome = new Map<string, (typeof all)[number]>();
  for (const c of all) {
    const { p } = c;
    if (excluded.has(p.eventId) || !finite(p.marketOdds) || p.marketOdds < minLeg || p.marketOdds > maxLeg) continue;
    if (p.risk === 'CRITICAL' || p.confidence < (input.minConfidence ?? 0.5) || p.ev < minEv || !(p.probability > 0)) continue;
    const key = p.eventId + '|' + p.label.trim().toLowerCase();
    const cur = perOutcome.get(key);
    if (!cur || p.marketOdds > cur.p.marketOdds) perOutcome.set(key, c);
  }
  const perEvent = new Map<string, (typeof all)[number][]>();
  for (const c of perOutcome.values()) perEvent.set(c.p.eventId, [...(perEvent.get(c.p.eventId) ?? []), c]);
  const chosen = [...perEvent.values()].flatMap((list) =>
    list.sort((x, y) => y.p.ev - x.p.ev || y.p.probability - x.p.probability).slice(0, OUTCOMES_PER_EVENT));
  const cands = chosen.map((c) => ({ ...c, logOdds: Math.log(c.p.marketOdds), logProb: Math.log(c.p.probability) }));
  return { cands, valuePoolSize, eventCount: perEvent.size };
}

const pct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}%`;

/** Plain-language rationale for a single leg (Polish, player-facing). */
export function explainLeg(c: { p: Prediction; bookmaker: string; books: number }): string {
  const { p } = c;
  const fair = p.probability > 0 ? 1 / p.probability : 0;
  const chance = `szansa wg rynku ${(p.probability * 100).toFixed(0)}%`;
  if (c.books < 2) {
    return `Kurs ${p.marketOdds.toFixed(2)} tylko u ${c.bookmaker} — brak porównania z innymi bukmacherami; ${chance}.`;
  }
  if (p.ev > 0.005) {
    return `${c.bookmaker} płaci ${p.marketOdds.toFixed(2)}, a uczciwy kurs wg ${c.books} bukmacherów to ${fair.toFixed(2)} → przewaga ${pct(p.ev)}; ${chance}.`;
  }
  return `Najlepszy dostępny kurs (${c.bookmaker} ${p.marketOdds.toFixed(2)} vs uczciwy ${fair.toFixed(2)}), bez przewagi (${pct(p.ev)}); wybrany, bo pasuje do celu przy najwyższej szansie (${chance}).`;
}

function toLeg(c: Candidate): CouponLeg {
  return {
    ...c.p,
    eventLabel: c.e.homeTeam + ' vs ' + c.e.awayTeam,
    league: c.e.league,
    startTime: c.e.startTime,
    bookmaker: c.bookmaker,
    bookmakerCount: c.books,
    reason: explainLeg(c),
  };
}

/**
 * Replace one leg with the best alternative from events not on the coupon:
 * keeps the combined odds as close to the target as possible, then prefers the
 * most likely outcome. Events in `excludeEventIds` and current legs are skipped.
 */
export function swapCouponLeg(input: CouponRequest, current: CouponResult, eventId: string): CouponResult {
  const mode = current.mode;
  const { cands, valuePoolSize, eventCount } = buildCandidates(input, mode);
  const keep = current.legs.filter((l) => l.eventId !== eventId);
  if (keep.length === current.legs.length) return current;
  const used = new Set(current.legs.map((l) => l.eventId));
  const rest = keep.reduce((o, l) => o * l.marketOdds, 1);
  const wanted = Math.log(current.targetOdds / rest);
  const tolerance = Math.max(0.01, Math.min(0.5, input.tolerance ?? 0.2));
  const options = cands.filter((c) => !used.has(c.e.id));
  if (!options.length) {
    return { ...current, warnings: [...new Set([...current.warnings, 'NO_SWAP_AVAILABLE'])] };
  }
  const within = (c: Candidate) => Math.abs(c.logOdds - wanted) <= Math.log(1 + tolerance);
  const best = [...options].sort((a, b) =>
    Number(within(b)) - Number(within(a)) ||
    (within(a) && within(b) ? b.logProb + b.logOdds - (a.logProb + a.logOdds) : Math.abs(a.logOdds - wanted) - Math.abs(b.logOdds - wanted)),
  )[0];
  return finalize(input, mode, [...keep, toLeg(best)], eventCount, valuePoolSize);
}

/** Drop one leg and recompute totals (the user accepts drifting from the target). */
export function removeCouponLeg(input: CouponRequest, current: CouponResult, eventId: string): CouponResult {
  const legs = current.legs.filter((l) => l.eventId !== eventId);
  return finalize(input, current.mode, legs, current.poolSize, current.valuePoolSize);
}

/**
 * Resolve user-picked selection ids to concrete legs at the best available
 * price (the same outcome is quoted by several bookmakers under one id).
 * One leg per event; unknown ids are ignored.
 */
function resolveSelections(events: EventWithMarkets[], selectionIds: string[]): Candidate[] {
  if (!selectionIds.length) return [];
  const wanted = new Set(selectionIds);
  const best = new Map<string, Candidate>();
  for (const e of events) {
    for (const m of e.markets) {
      const books = new Set(e.markets.filter((x) => x.type === m.type).map((x) => x.category)).size;
      for (const s of m.selections) {
        if (!wanted.has(s.id) || !finite(s.odds) || s.odds <= 1) continue;
        const p = predictSelection(s);
        const cur = best.get(e.id);
        if (!cur || p.marketOdds > cur.p.marketOdds) {
          best.set(e.id, { p, e, bookmaker: m.category, books, logOdds: Math.log(p.marketOdds), logProb: Math.log(Math.max(1e-9, p.probability)) });
        }
      }
    }
  }
  return [...best.values()];
}

/** Public helper for the slip: picked selections as coupon legs (best price, with reasons). */
export function legsForSelections(events: EventWithMarkets[], selectionIds: string[]): CouponLeg[] {
  return resolveSelections(events, selectionIds).map(toLeg);
}
