import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Crown, LineChart, Target } from 'lucide-react';
import { useIntelligence } from '../state/IntelligenceProvider';
import { useSlip } from '../state/SlipProvider';
import { liveEvents } from '../services/liveAdapter';
import { toMatchRow, type MatchRow, type OutcomeCell, type OutcomeKey } from '../lib/matchBoard';
import { VersusHero } from '../components/VersusHero';

function pickFor(row: MatchRow, o: OutcomeCell) {
  return {
    eventId: row.event.id, selectionId: o.selectionId, label: o.label, odds: o.odds, bookmaker: o.bookmaker,
    eventLabel: `${row.event.homeTeam} vs ${row.event.awayTeam}`, league: row.event.league, startTime: row.event.startTime, probability: o.probability,
  };
}

/** Three plain sentences a fan can act on. */
function marketStory(row: MatchRow): string[] {
  const { event, outcomes } = row;
  const name = (k: OutcomeKey) => (k === '1' ? event.homeTeam : k === '2' ? event.awayTeam : 'remis');
  const fav = [...outcomes].sort((a, b) => b.probability - a.probability)[0];
  const lines: string[] = [];
  const p = fav.probability;
  lines.push(p >= 0.6
    ? `Rynek widzi wyraźnego faworyta: ${name(fav.key)} wygrywa w ${Math.round(p * 100)}% scenariuszy.`
    : p >= 0.45
      ? `Lekka przewaga ${name(fav.key)} (${Math.round(p * 100)}%), ale to wciąż mecz na styku.`
      : `Mecz bez faworyta — żaden wynik nie przekracza ${Math.round(p * 100)}% szans. Czysta rywalizacja.`);
  const value = outcomes.filter((o) => o.ev > 0.005).sort((a, b) => b.ev - a.ev)[0];
  lines.push(value
    ? `${value.bookmaker} płaci za „${name(value.key)}” ${value.odds.toFixed(2)} — to o ${(value.ev * 100).toFixed(1)}% więcej niż uczciwa wycena rynku.`
    : 'Żaden bukmacher nie płaci powyżej uczciwej wyceny — tu nie ma darmowych pieniędzy, liczy się Twoja ocena meczu.');
  const spreads = (['1', 'X', '2'] as const).map((k) => {
    const q = row.quotes[k];
    return q.length > 1 ? { k, gap: q[0].odds / q[q.length - 1].odds - 1 } : null;
  }).filter((x): x is { k: OutcomeKey; gap: number } => Boolean(x)).sort((a, b) => b.gap - a.gap)[0];
  if (spreads && spreads.gap > 0.02) {
    lines.push(`Na „${name(spreads.k)}” różnica między najlepszym a najgorszym kursem to ${(spreads.gap * 100).toFixed(0)}% — wybór bukmachera ma znaczenie.`);
  } else {
    lines.push('Bukmacherzy są zgodni co do cen — wybór bukmachera niewiele zmienia.');
  }
  return lines;
}

export function MatchArenaPage() {
  const { eventId = '' } = useParams();
  const { dataset, phase } = useIntelligence();
  const slip = useSlip();
  const row = useMemo(() => {
    const ev = dataset ? liveEvents(dataset).find((e) => e.id === decodeURIComponent(eventId)) : undefined;
    return ev ? toMatchRow(ev) : null;
  }, [dataset, eventId]);

  if (!row) {
    return (
      <main className="mx-auto max-w-[900px] px-4 py-10 text-slate-300">
        {phase === 'loading' ? <p role="status">Wczytywanie meczu…</p> : <p>Nie znaleziono meczu w aktualnych danych.</p>}
        <Link to="/" className="mt-4 inline-flex items-center gap-2 font-bold text-amber-200"><ArrowLeft size={14} /> Wróć do meczów</Link>
      </main>
    );
  }

  const { event } = row;
  const story = marketStory(row);
  const label = (k: OutcomeKey) => (k === '1' ? event.homeTeam : k === '2' ? event.awayTeam : 'Remis');

  return (
    <main className="mx-auto w-full max-w-[1000px] px-4 pb-32 pt-2 md:px-6">
      <Link to="/" className="mb-3 inline-flex min-h-[44px] items-center gap-2 text-xs font-bold text-slate-400 hover:text-white"><ArrowLeft size={14} /> Mecze</Link>

      <VersusHero row={row} badge="Arena" isPicked={slip.has} onPick={(o) => slip.toggle(pickFor(row, o))} />

      <section className="mt-6 grid gap-5 md:grid-cols-[1.2fr_1fr]">
        <div className="fl-ticket p-5">
          <h2 className="fl-label">Wyścig bukmacherów</h2>
          <p className="mt-1 text-xs text-slate-500">Kto płaci najwięcej za każdy wynik. Korona = najlepszy kurs.</p>
          <div className="mt-4 space-y-5">
            {(['1', 'X', '2'] as const).filter((k) => row.quotes[k].length).map((k) => {
              const q = row.quotes[k];
              const max = q[0].odds;
              const min = q[q.length - 1].odds;
              return (
                <div key={k}>
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-sm font-bold text-white">{label(k)}</span>
                    {q.length > 1 && <span className="text-[11px] text-slate-500">rozrzut {((max / min - 1) * 100).toFixed(1)}%</span>}
                  </div>
                  <div className="space-y-1.5">
                    {q.map((b, i) => {
                      const w = max === min ? 100 : 35 + ((b.odds - min) / (max - min)) * 65;
                      return (
                        <div key={b.bookmaker} className={`race-row ${i === 0 ? 'race-row--best' : ''}`}>
                          <span className="truncate text-xs text-slate-300">{b.bookmaker}</span>
                          <span className="race-bar"><i style={{ width: `${w}%`, ['--i' as string]: i }} /></span>
                          <span className="fl-num inline-flex items-center justify-end gap-1 text-sm font-black text-white">{i === 0 && <Crown size={12} className="text-amber-300" />}{b.odds.toFixed(2)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-5">
          <div className="fl-ticket p-5">
            <h2 className="fl-label">Co mówi rynek</h2>
            <ol className="mt-3 space-y-3">
              {story.map((line, i) => (
                <li key={i} className="fl-in flex gap-3 text-sm leading-6 text-slate-200" style={{ ['--i' as string]: i }}>
                  <span className="fl-display mt-0.5 text-xl text-amber-200">{i + 1}</span>{line}
                </li>
              ))}
            </ol>
          </div>
          <div className="fl-ticket p-5">
            <h2 className="fl-label">Zagraj to</h2>
            <p className="mt-2 text-sm text-slate-300">Dodaj typ powyżej, a potem pozwól silnikowi dobrać resztę kuponu pod Twój kurs.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/builder" className="fl-btn fl-cta inline-flex items-center gap-2 px-4 text-xs font-black uppercase tracking-[.1em]"><Target size={14} /> Zbuduj kupon</Link>
              <Link to={`/analysis/${encodeURIComponent(event.id)}`} className="fl-btn inline-flex items-center gap-2 border border-white/10 px-4 text-xs font-bold text-slate-200"><LineChart size={14} /> Pełna analiza</Link>
            </div>
          </div>
        </div>
      </section>
      <p className="mt-6 text-[11px] text-slate-500">18+. Kursy i szanse pochodzą od bukmacherów i mogą się zmienić. Graj odpowiedzialnie.</p>
    </main>
  );
}

export default MatchArenaPage;
