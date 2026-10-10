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
}

export interface CouponLeg extends Prediction { eventLabel: string; league: string; startTime: string; }

export interface CouponResult {
  status: CouponStatus;
  mode: CouponMode;
  targetOdds: number;
  combinedOdds: number;
  targetReached: boolean;
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
const BEAM_WIDTH = 60;

interface Candidate { p: Prediction; e: EventWithMarkets; logOdds: number; logProb: number; }
interface State { legs: Candidate[]; logOdds: number; logProb: number; events: Set<string>; }

/**
 * For a fixed target payout, maximising the joint win probability is the same
 * as maximising EV (EV = P·odds − 1). So: pick a set of independent events
 * (one leg per event) whose combined odds land within tolerance of the target
 * and whose product of fair probabilities is highest. Beam search keeps it
 * deterministic and fast for a few hundred candidates.
 */
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
  const minLeg = input.minLegOdds ?? 1.2;
  const maxLeg = input.maxLegOdds ?? 10;
  const minEv = mode === 'VALUE_ONLY' ? 1e-9 : (input.minEv ?? -0.08);
  const excluded = new Set(input.excludeEventIds ?? []);

  const empty = (blockers: string[], poolSize = 0, valuePoolSize = 0): CouponResult => ({
    status: 'BLOCKED', mode, targetOdds: target, combinedOdds: 0, targetReached: false, stake,
    potentialReturn: 0, potentialProfit: 0, estimatedProbability: 0, estimatedEv: 0, legs: [],
    poolSize, valuePoolSize, blockers, warnings: [], rationale: [],
  });
  if (!target) return empty(['TARGET_ODDS_INVALID']);

  const all = input.events.flatMap((e) =>
    e.markets.flatMap((m) => m.selections.map((s) => ({ p: predictSelection(s), e }))));
  const valuePoolSize = all.filter((c) => c.p.ev > 0 && c.p.risk !== 'CRITICAL').length;

  // one candidate per event: the selection with the highest EV (best price vs consensus)
  const perEvent = new Map<string, { p: Prediction; e: EventWithMarkets }>();
  for (const c of all) {
    const { p } = c;
    if (excluded.has(p.eventId) || !finite(p.marketOdds) || p.marketOdds < minLeg || p.marketOdds > maxLeg) continue;
    if (p.risk === 'CRITICAL' || p.confidence < (input.minConfidence ?? 0.5) || p.ev < minEv || !(p.probability > 0)) continue;
    const cur = perEvent.get(p.eventId);
    // prefer more likely outcomes at equal EV so coupons are not longshot-heavy
    if (!cur || p.ev > cur.p.ev + 1e-9 || (Math.abs(p.ev - cur.p.ev) <= 1e-9 && p.probability > cur.p.probability)) perEvent.set(p.eventId, c);
  }
  const cands: Candidate[] = [...perEvent.values()].map((c) => ({
    ...c, logOdds: Math.log(c.p.marketOdds), logProb: Math.log(c.p.probability),
  }));
  if (!cands.length) {
    return empty([mode === 'VALUE_ONLY' ? 'NO_VALUE_SELECTIONS' : 'NO_QUALIFIED_SELECTIONS'], 0, valuePoolSize);
  }

  const picked = search(cands, target, tolerance, maxLegs);
  const legs: CouponLeg[] = (picked?.legs ?? [])
    .map(({ p, e }) => ({ ...p, eventLabel: e.homeTeam + ' vs ' + e.awayTeam, league: e.league, startTime: e.startTime }))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

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
    mode, targetOdds: target, combinedOdds: legs.length ? combined : 0, targetReached, stake,
    potentialReturn: stake * (legs.length ? combined : 0),
    potentialProfit: Math.max(0, stake * combined - stake) * (legs.length ? 1 : 0),
    estimatedProbability: legs.length ? probability : 0, estimatedEv: ev, legs,
    poolSize: cands.length, valuePoolSize, blockers, warnings,
    rationale: [
      `Pula: ${cands.length} wydarzeń po filtrach (${valuePoolSize} typów z EV > 0 w całym feedzie).`,
      `Cel ${target.toFixed(2)} ±${Math.round(tolerance * 100)}% · wynik ${legs.length ? combined.toFixed(2) : '—'}.`,
      `Szansa wg konsensusu rynku ${(probability * 100).toFixed(1)}% · EV ${(ev * 100).toFixed(1)}%.`,
    ],
  };
}
