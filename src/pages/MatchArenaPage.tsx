import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Crown, Gem, Landmark, LineChart, Scale, Target } from 'lucide-react';
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

  const ICONS = [Scale, Gem, Landmark];
  return (
    <main className="mx-auto w-full max-w-[1180px] px-4 pb-32 pt-4 md:px-6">
      <Link to="/" className="ar-back mb-3"><ArrowLeft size={15} /> Mecze</Link>

      <VersusHero row={row} badge="Arena" isPicked={slip.has} onPick={(o) => slip.toggle(pickFor(row, o))} />

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <div className="ar-glass ar-lift p-6 md:p-7">
          <h2 className="ar-label">Wyścig bukmacherów</h2>
          <p className="ar-sub">Kto płaci najwięcej za każdy wynik. Korona = najlepszy kurs.</p>
          <div className="mt-6">
            {(['1', 'X', '2'] as const).filter((k) => row.quotes[k].length).map((k, gi) => {
              const q = row.quotes[k];
              const max = q[0].odds;
              const min = q[q.length - 1].odds;
              return (
                <div key={k} className="ar-race__group">
                  <div className="ar-race__head">
                    <span className="ar-race__title">{label(k)}</span>
                    {q.length > 1 && <span className="ar-race__spread">rozrzut {((max / min - 1) * 100).toFixed(1)}%</span>}
                  </div>
                  {q.map((b, i) => {
                    const w = max === min ? 100 : 40 + ((b.odds - min) / (max - min)) * 60;
                    return (
                      <div key={b.bookmaker} className={`ar-race__row ${i === 0 ? 'ar-race__row--best' : ''}`}>
                        <span className="ar-race__book">{b.bookmaker}</span>
                        <span className="ar-race__track"><i className="ar-race__fill" style={{ width: `${w}%`, ['--i' as string]: gi * 3 + i }} /></span>
                        <span className="ar-race__odds ar-num">{i === 0 && <Crown size={13} className="text-amber-300" aria-label="najlepszy kurs" />}{b.odds.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="ar-glass ar-lift p-6 md:p-7">
            <h2 className="ar-label">Co mówi rynek</h2>
            <ol className="mt-3">
              {story.map((line, i) => {
                const Icon = ICONS[i] ?? Scale;
                return (
                  <li key={i} className="ar-insight fl-in" style={{ ['--i' as string]: i }}>
                    <span className="ar-insight__icon" aria-hidden="true"><Icon size={16} /></span>
                    <div>
                      <div className="ar-insight__n">{String(i + 1).padStart(2, '0')}</div>
                      <p className="ar-insight__t">{line}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="ar-glass ar-lift p-6 md:p-7">
            <h2 className="ar-label">Zagraj to</h2>
            <p className="ar-cta-copy mt-3">Dodaj typ powyżej, a potem pozwól silnikowi dobrać resztę kuponu pod Twój kurs.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link to="/builder" className="ar-btn ar-btn--primary flex-1 sm:flex-none"><Target size={17} /> Zbuduj kupon</Link>
              <Link to={`/analysis/${encodeURIComponent(event.id)}`} className="ar-btn ar-btn--ghost flex-1 sm:flex-none"><LineChart size={17} /> Pełna analiza</Link>
            </div>
          </div>
        </div>
      </section>
      <p className="ar-foot mt-6">18+. Kursy i szanse pochodzą od bukmacherów i mogą się zmienić. Graj odpowiedzialnie.</p>
    </main>
  );
}

export default MatchArenaPage;
