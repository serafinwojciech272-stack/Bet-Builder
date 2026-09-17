import { det } from '../numbers';
import type { DeterministicNumber, MarketKey, SportEvent } from '../types';

const SERVICE_ID = 'probability-service' as const;
export const MODEL_VERSION = 'badbuilder-quant-v2.4.1';

export interface ModelProbability {
  selectionId: string;
  label: string;
  probability: DeterministicNumber;
  fairOdds: DeterministicNumber;
  /** Named deterministic inputs that produced the probability. */
  drivers: Array<{ label: string; contribution: DeterministicNumber }>;
}

export interface ModelProbabilitySet {
  eventId: string;
  market: MarketKey;
  modelVersion: string;
  probabilities: ModelProbability[];
  inputsDigest: string;
  computedAt: string;
}

function formScore(form: Array<'W' | 'D' | 'L'>): number {
  if (!form.length) return 0;
  const weights = [0.32, 0.26, 0.19, 0.13, 0.1];
  let score = 0;
  form.forEach((r, i) => {
    const w = weights[i] ?? 0.05;
    score += w * (r === 'W' ? 1 : r === 'D' ? 0.45 : 0);
  });
  return score;
}

function digest(parts: Array<string | number>): string {
  const raw = parts.join('|');
  let h = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `sha-${(h >>> 0).toString(16).padStart(8, '0')}`;
}

function poissonPmf(lambda: number, k: number): number {
  let fact = 1;
  for (let i = 2; i <= k; i += 1) fact *= i;
  return (Math.exp(-lambda) * lambda ** k) / fact;
}

function effectiveRatings(event: SportEvent) {
  const homeAdvantage = event.sportKey === 'soccer' ? 42 : event.sportKey === 'basketball' ? 34 : 28;
  const home =
    event.homeTeam.rating + homeAdvantage + formScore(event.homeTeam.form) * 46 - event.homeTeam.injuriesOut * 11;
  const away =
    event.awayTeam.rating + formScore(event.awayTeam.form) * 46 - event.awayTeam.injuriesOut * 11;
  return { home, away, homeAdvantage };
}

/**
 * Stage 5a: deterministic model probabilities.
 * Pure function of canonical event attributes — no market prices, no AI.
 */
export function computeModelProbabilities(
  event: SportEvent,
  market: MarketKey,
  selectionIds: readonly string[],
  now: Date = new Date(),
): ModelProbabilitySet {
  const { home, away, homeAdvantage } = effectiveRatings(event);
  const eloDiff = home - away;
  const pHomeTwoWay = 1 / (1 + 10 ** (-eloDiff / 400));

  const lambdaBase = event.sportKey === 'soccer' ? 2.62 : 2.2;
  const lambdaHome = Math.max(0.35, (lambdaBase / 2) * (1 + (eloDiff / 900)) + 0.14);
  const lambdaAway = Math.max(0.3, (lambdaBase / 2) * (1 - (eloDiff / 900)));

  const probabilities: ModelProbability[] = [];

  const push = (
    selectionId: string,
    label: string,
    probability: number,
    drivers: Array<{ label: string; contribution: number }>,
  ) => {
    const p = Math.max(0.005, Math.min(0.99, probability));
    probabilities.push({
      selectionId,
      label,
      probability: det(p, 'probability', SERVICE_ID),
      fairOdds: det(1 / p, 'decimal-odds', SERVICE_ID),
      drivers: drivers.map((d) => ({
        label: d.label,
        contribution: det(d.contribution, 'ratio', SERVICE_ID),
      })),
    });
  };

  const sharedDrivers = [
    { label: 'Rating differential', contribution: eloDiff / 400 },
    { label: 'Home advantage', contribution: homeAdvantage / 400 },
    { label: 'Recent form delta', contribution: formScore(event.homeTeam.form) - formScore(event.awayTeam.form) },
    { label: 'Availability delta', contribution: (event.awayTeam.injuriesOut - event.homeTeam.injuriesOut) * 0.04 },
  ];

  if (market === 'match-winner') {
    const drawBase = 0.245 - Math.abs(eloDiff) / 4200;
    const pDraw = Math.max(0.08, drawBase);
    const rest = 1 - pDraw;
    push('home', `${event.homeTeam.name} win`, rest * pHomeTwoWay, sharedDrivers);
    push('draw', 'Draw', pDraw, [
      { label: 'Rating symmetry', contribution: 1 - Math.abs(eloDiff) / 400 },
      { label: 'League draw base rate', contribution: drawBase },
    ]);
    push('away', `${event.awayTeam.name} win`, rest * (1 - pHomeTwoWay), sharedDrivers);
  } else if (market === 'moneyline') {
    push('home', `${event.homeTeam.name} win`, pHomeTwoWay, sharedDrivers);
    push('away', `${event.awayTeam.name} win`, 1 - pHomeTwoWay, sharedDrivers);
  } else if (market === 'spread') {
    const edgeShift = 0.5 - eloDiff / 2600;
    push('home-spread', `${event.homeTeam.shortName} handicap`, 1 - edgeShift, sharedDrivers);
    push('away-spread', `${event.awayTeam.shortName} handicap`, edgeShift, sharedDrivers);
  } else if (market === 'totals') {
    const lambdaTotal = lambdaHome + lambdaAway;
    const pUnder =
      poissonPmf(lambdaTotal, 0) + poissonPmf(lambdaTotal, 1) + poissonPmf(lambdaTotal, 2);
    push('over-2.5', 'Over 2.5', 1 - pUnder, [
      { label: 'Expected total (Poisson λ)', contribution: lambdaTotal },
      { label: 'Attacking form blend', contribution: formScore(event.homeTeam.form) + formScore(event.awayTeam.form) },
    ]);
    push('under-2.5', 'Under 2.5', pUnder, [
      { label: 'Expected total (Poisson λ)', contribution: lambdaTotal },
      { label: 'Defensive availability', contribution: 1 - (event.homeTeam.injuriesOut + event.awayTeam.injuriesOut) * 0.05 },
    ]);
  } else {
    const pHomeScores = 1 - poissonPmf(lambdaHome, 0);
    const pAwayScores = 1 - poissonPmf(lambdaAway, 0);
    const pYes = pHomeScores * pAwayScores;
    push('btts-yes', 'Both teams to score – Yes', pYes, [
      { label: 'Home scoring λ', contribution: lambdaHome },
      { label: 'Away scoring λ', contribution: lambdaAway },
    ]);
    push('btts-no', 'Both teams to score – No', 1 - pYes, [
      { label: 'Clean-sheet likelihood', contribution: poissonPmf(lambdaAway, 0) },
      { label: 'Rating differential', contribution: eloDiff / 400 },
    ]);
  }

  const known = new Set(probabilities.map((p) => p.selectionId));
  for (const sel of selectionIds) {
    if (!known.has(sel)) {
      push(sel, sel, 1 / Math.max(2, selectionIds.length), [
        { label: 'Uniform fallback (unmapped selection)', contribution: 0 },
      ]);
    }
  }

  return {
    eventId: event.id,
    market,
    modelVersion: MODEL_VERSION,
    probabilities,
    inputsDigest: digest([
      event.id,
      market,
      event.homeTeam.rating,
      event.awayTeam.rating,
      event.homeTeam.form.join(''),
      event.awayTeam.form.join(''),
      event.homeTeam.injuriesOut,
      event.awayTeam.injuriesOut,
      MODEL_VERSION,
    ]),
    computedAt: now.toISOString(),
  };
}
