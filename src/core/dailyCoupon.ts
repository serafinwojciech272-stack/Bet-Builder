import type { OddsSnapshot, SportEvent, Selection } from '../domain/types.js';
import { impliedProbability, modelEv, riskForOdds } from '../analytics/calcs.js';

export interface DailyCouponInput {
  date: string; // Europe/Warsaw calendar date: YYYY-MM-DD
  events: SportEvent[];
  snapshots: OddsSnapshot[];
  bookmakers?: string[];
  stake: number;
  maxLegs?: number;
  minOdds?: number;
  maxOdds?: number;
  targetCombinedOdds?: number;
  providerHealth?: {
    provider: string;
    state: 'HEALTHY' | 'DEGRADED' | 'STALE' | 'OFFLINE';
    ageSeconds: number;
    staleAfterSeconds: number;
    snapshotCount: number;
    bookmakerCount: number;
  };
}

export interface DailyCouponLeg {
  eventId: string;
  eventLabel: string;
  sport: string;
  league: string;
  startTime: string;
  market: string;
  selectionId: string;
  selection: string;
  bookmaker: string;
  odds: number;
  impliedProbability: number;
  modelProbability: number;
  edge: number;
  ev: number;
  confidence: number;
  risk: Selection['risk'];
  rationale: string;
}

export interface DailyCouponResult {
  date: string;
  bookmakersRequested: string[];
  bookmakersFound: string[];
  eligibleEvents: number;
  eligibleMarkets: number;
  legs: DailyCouponLeg[];
  combinedOdds: number;
  stake: number;
  potentialReturn: number;
  potentialProfit: number;
  estimatedProbability: number;
  estimatedEv: number;
  status: 'READY' | 'REVIEW' | 'BLOCKED';
  blockers: string[];
  warnings: string[];
  analysis: string;
  description: string;
  sourceStatus: 'VERIFIED' | 'DEGRADED' | 'UNAVAILABLE';
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]+/gi, '');

const aliases: Record<string, string[]> = {
  sts: ['sts', 'stsbet'],
  superbet: ['superbet'],
};

function bookmakerMatches(actual: string, requested: string): boolean {
  const a = normalize(actual);
  const r = normalize(requested);
  if (a === r || a.includes(r) || r.includes(a)) return true;
  return (aliases[r] ?? []).some(alias => a.includes(normalize(alias)));
}

function warsawDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

const consensusKey = (market: string, label: string) => market + '|' + label.trim().toLowerCase();

/**
 * Proportional de-vig per bookmaker, then averaged per selection across
 * bookmakers. Uses only the latest snapshot per bookmaker+market.
 */
function marketConsensus(snapshots: OddsSnapshot[]): Map<string, { probability: number; books: number }> {
  const latest = new Map<string, OddsSnapshot>();
  for (const s of snapshots) {
    const key = s.market + '|' + String(s.bookmaker);
    const current = latest.get(key);
    if (!current || current.capturedAt < s.capturedAt) latest.set(key, s);
  }
  const sums = new Map<string, { total: number; books: number }>();
  for (const s of latest.values()) {
    const quotes = s.quotes.filter(q => Number.isFinite(q.decimalOdds) && q.decimalOdds > 1);
    if (quotes.length < 2) continue;
    const book = quotes.reduce((sum, q) => sum + 1 / q.decimalOdds, 0);
    if (book <= 0) continue;
    for (const q of quotes) {
      const key = consensusKey(s.market, q.label);
      const entry = sums.get(key) ?? { total: 0, books: 0 };
      entry.total += (1 / q.decimalOdds) / book;
      entry.books += 1;
      sums.set(key, entry);
    }
  }
  const out = new Map<string, { probability: number; books: number }>();
  for (const [key, v] of sums) out.set(key, { probability: v.total / v.books, books: v.books });
  return out;
}

export function buildDailyCoupon(input: DailyCouponInput): DailyCouponResult {
  const maxLegs = Math.max(1, Math.min(12, input.maxLegs ?? 5));
  const minOdds = Math.max(1.01, input.minOdds ?? 1.25);
  const maxOdds = Math.max(minOdds, input.maxOdds ?? 4.5);
  const stake = Number.isFinite(input.stake) && input.stake >= 0 ? input.stake : 0;
  const requested = input.bookmakers?.filter(Boolean) ?? [];

  const dayEvents = input.events.filter(event => warsawDate(event.startTime) === input.date && event.status !== 'final');
  const eventIds = new Set(dayEvents.map(event => event.id));
  const snapshots = input.snapshots.filter(snapshot => eventIds.has(snapshot.eventId));
  const bookmakerSet = requested.length
    ? snapshots.filter(s => requested.some(r => bookmakerMatches(String(s.bookmaker), r))).map(s => String(s.bookmaker))
    : snapshots.map(s => String(s.bookmaker));
  const bookmakersFound = [...new Set(bookmakerSet)];

  const candidates: DailyCouponLeg[] = [];
  for (const event of dayEvents) {
    const eventSnapshots = snapshots.filter(s => s.eventId === event.id);
    const bySelection = new Map<string, DailyCouponLeg>();

    const consensus = marketConsensus(eventSnapshots);

    for (const snapshot of eventSnapshots) {
      if (requested.length && !requested.some(r => bookmakerMatches(String(snapshot.bookmaker), r))) continue;
      for (const quote of snapshot.quotes) {
        if (!Number.isFinite(quote.decimalOdds) || quote.decimalOdds < minOdds || quote.decimalOdds > maxOdds) continue;
        const implied = impliedProbability(quote.decimalOdds);
        const fair = consensus.get(consensusKey(snapshot.market, quote.label));
        if (!fair) continue;
        // Honest edge: best available price vs the de-vigged consensus of all
        // bookmakers in the feed. With a single bookmaker the margin makes EV
        // negative, so no leg is ever promoted on fabricated value.
        const modelProbability = fair.probability;
        const edge = modelProbability - implied;
        const ev = modelEv(modelProbability, quote.decimalOdds);
        const confidence = Math.min(0.9, 0.55 + Math.min(0.25, (fair.books - 1) * 0.07));
        const risk = riskForOdds(quote.decimalOdds);
        const candidate: DailyCouponLeg = {
          eventId: event.id,
          eventLabel: event.homeTeam.name + ' vs ' + event.awayTeam.name,
          sport: event.sportKey,
          league: event.league.name,
          startTime: event.startTime,
          market: snapshot.market,
          selectionId: quote.selectionId,
          selection: quote.label,
          bookmaker: String(snapshot.bookmaker),
          odds: quote.decimalOdds,
          impliedProbability: implied,
          modelProbability,
          edge,
          ev,
          confidence,
          risk,
          rationale: fair.books > 1
            ? `Kurs powyżej konsensusu ${fair.books} bukmacherów (uczciwe p=${(modelProbability * 100).toFixed(1)}%).`
            : 'Jedno źródło kursu — brak konsensusu rynkowego.',
        };
        const existing = bySelection.get(quote.label.toLowerCase());
        if (!existing || candidate.odds > existing.odds || candidate.ev > existing.ev) bySelection.set(quote.label.toLowerCase(), candidate);
      }
    }
    candidates.push(...bySelection.values());
  }

  const ranked = candidates
    .filter(c => c.ev > 0 && c.confidence >= 0.55 && c.risk !== 'CRITICAL')
    .sort((a, b) => (b.ev * 0.45 + b.confidence * 0.35 + b.edge * 0.20) - (a.ev * 0.45 + a.confidence * 0.35 + a.edge * 0.20));

  const legs: DailyCouponLeg[] = [];
  const usedEvents = new Set<string>();
  let combinedOdds = 1;
  const target = input.targetCombinedOdds ?? 0;
  for (const candidate of ranked) {
    if (legs.length >= maxLegs || usedEvents.has(candidate.eventId)) continue;
    const nextOdds = combinedOdds * candidate.odds;
    if (target > 0 && legs.length > 0 && nextOdds > target * 1.12) continue;
    legs.push(candidate);
    combinedOdds = nextOdds;
    usedEvents.add(candidate.eventId);
  }

  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!dayEvents.length) blockers.push('Brak wydarzeń na wskazany dzień.');
  if (input.providerHealth?.state === 'OFFLINE') blockers.push('Dostawca danych jest OFFLINE — kupon nie może zostać oznaczony jako gotowy.');
  if (input.providerHealth?.state === 'STALE') blockers.push(`Dane dostawcy są STALE (${input.providerHealth.ageSeconds}s > ${input.providerHealth.staleAfterSeconds}s).`);
  if (requested.length && !bookmakersFound.length) blockers.push('Wybrani bukmacherzy nie występują w aktualnym feedzie.');
  if (!legs.length && !blockers.length) blockers.push('Brak typów spełniających filtry jakości.');
  if (legs.length < Math.min(2, maxLegs) && !blockers.length) warnings.push('Liczba kwalifikujących się zdarzeń jest ograniczona.');
  if (input.providerHealth?.state === 'DEGRADED') warnings.push(`Dostawca działa w trybie DEGRADED (${input.providerHealth.provider}).`);
  if (snapshots.length === 0 && dayEvents.length) warnings.push('Dzień zawiera mecze, ale brak aktualnych kursów w feedzie.');

  const estimatedProbability = legs.reduce((p, leg) => p * leg.modelProbability, 1);
  const estimatedEv = combinedOdds > 0 ? estimatedProbability * combinedOdds - 1 : -1;
  const potentialReturn = stake * combinedOdds;
  const potentialProfit = Math.max(0, potentialReturn - stake);
  const status: DailyCouponResult['status'] = blockers.length ? 'BLOCKED' : warnings.length ? 'REVIEW' : 'READY';
  const sourceStatus: DailyCouponResult['sourceStatus'] = blockers.length || !bookmakersFound.length ? 'UNAVAILABLE' : input.providerHealth?.state === 'DEGRADED' ? 'DEGRADED' : 'VERIFIED';

  const analysis = legs.length
    ? `Przeskanowano ${dayEvents.length} wydarzeń z ${input.date}. Wybrano ${legs.length} rozdzielonych zdarzeń po filtrze kursów, jakości, EV i korelacji. Łączny kurs ${combinedOdds.toFixed(2)}, modelowe prawdopodobieństwo ${(estimatedProbability * 100).toFixed(1)}%, EV ${(estimatedEv * 100).toFixed(1)}%.`
    : `Przeskanowano ${dayEvents.length} wydarzeń z ${input.date}; nie znaleziono kuponu spełniającego zadane kryteria.`;
  const description = legs.map((leg, i) => `${i + 1}. ${leg.eventLabel} — ${leg.selection} @ ${leg.odds.toFixed(2)} (${leg.bookmaker}). ${leg.rationale}`).join(' ');

  return {
    date: input.date,
    bookmakersRequested: requested,
    bookmakersFound,
    eligibleEvents: dayEvents.length,
    eligibleMarkets: candidates.length,
    legs,
    combinedOdds,
    stake,
    potentialReturn,
    potentialProfit,
    estimatedProbability,
    estimatedEv,
    status,
    blockers,
    warnings,
    analysis,
    description,
    sourceStatus,
  };
}
