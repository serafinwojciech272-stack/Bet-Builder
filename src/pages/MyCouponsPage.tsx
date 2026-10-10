import { Link } from 'react-router-dom';
import { Ticket, Trash2 } from 'lucide-react';
import { useSlip, type SavedCoupon } from '../state/SlipProvider';
import { useIntelligence } from '../state/IntelligenceProvider';

const pln = (n: number) => n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (iso: string) => new Date(iso).toLocaleString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function status(c: SavedCoupon, now: number): { label: string; tone: string } {
  const starts = c.legs.map((l) => new Date(l.startTime).getTime());
  if (starts.every((t) => t > now)) return { label: 'Przed meczami', tone: 'text-slate-300 border-white/15' };
  // ~2h per match is a conservative "finished" heuristic until results are settled server-side (F3)
  if (starts.every((t) => t + 2 * 3_600_000 < now)) return { label: 'Mecze zakończone · wynik wkrótce', tone: 'text-amber-200 border-amber-300/30' };
  return { label: 'W grze', tone: 'text-emerald-300 border-emerald-300/30' };
}

export function MyCouponsPage() {
  const { saved, deleteSaved } = useSlip();
  const { nowTick } = useIntelligence();
  const now = nowTick;

  return (
    <main className="mx-auto w-full max-w-[900px] px-4 pb-24 pt-2 md:px-6">
      <section className="fl-stage rounded-[24px] border border-white/[.07] px-5 py-7 md:px-8">
        <div aria-hidden="true" className="fl-beams"><span className="fl-beam fl-beam--l" /><span className="fl-beam fl-beam--r" /></div>
        <div className="text-[10px] font-black uppercase tracking-[.26em] text-amber-200/80">Twoje bilety</div>
        <h1 className="fl-display mt-2 text-5xl text-white">MOJE KUPONY</h1>
        <p className="mt-2 text-sm text-slate-300">{saved.length ? `${saved.length} zapisanych · łączna stawka ${pln(saved.reduce((s, c) => s + c.stake, 0))} PLN` : 'Zapisane kupony pojawią się tutaj.'}</p>
      </section>

      {!saved.length && (
        <div className="mt-6 rounded-2xl border border-white/[.07] bg-white/[.02] p-8 text-center">
          <Ticket className="mx-auto text-amber-200" size={28} />
          <p className="mt-3 text-sm text-slate-300">Nie masz jeszcze zapisanych kuponów.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link to="/" className="fl-btn inline-flex items-center border border-white/10 px-4 text-xs font-bold text-white">Wybierz mecze</Link>
            <Link to="/builder" className="fl-btn fl-cta inline-flex items-center px-4 text-xs font-black uppercase">Zbuduj kupon</Link>
          </div>
        </div>
      )}

      <div className="fl-stack mt-6">
        {saved.map((c, i) => {
          const st = status(c, now);
          return (
            <article key={c.id} className="fl-ticket fl-in overflow-hidden" style={{ ['--i' as string]: Math.min(i, 8) }}>
              <div className="flex flex-wrap items-start justify-between gap-3 p-5">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[.2em] text-slate-500">{when(c.savedAt)} · {c.legs.length} {c.legs.length === 1 ? 'mecz' : 'mecze/ów'}</div>
                  <div className="fl-display mt-1 text-4xl text-white">KURS <span className="text-amber-200">{c.combinedOdds.toFixed(2)}</span></div>
                </div>
                <div className="text-right">
                  <span className={`inline-block rounded-full border px-3 py-1 text-[11px] font-bold ${st.tone}`}>{st.label}</span>
                  <div className="mt-2 text-xs text-slate-400">stawka {pln(c.stake)} PLN</div>
                  <div className="fl-display text-2xl text-white">{pln(c.stake * c.combinedOdds)} <span className="text-sm text-slate-400">PLN</span></div>
                </div>
              </div>
              <div className="fl-ticket__tear" />
              <ul className="space-y-2 p-5">
                {c.legs.map((l) => (
                  <li key={l.selectionId} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-bold text-white">{l.eventLabel}</div>
                      <div className="text-[11px] text-slate-500">{l.league} · {when(l.startTime)} · {l.bookmaker}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs text-slate-300">{l.label}</div>
                      <span className="fl-odds fl-num">{l.odds.toFixed(2)}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between border-t border-white/[.06] px-5 py-3 text-[11px] text-slate-500">
                <span>szansa wg rynku {(c.probability * 100).toFixed(1)}% · {c.ev > 0 ? `przewaga +${(c.ev * 100).toFixed(1)}%` : 'bez przewagi'}</span>
                <button type="button" onClick={() => deleteSaved(c.id)} aria-label="Usuń kupon" className="fl-btn inline-grid w-11 place-items-center text-slate-500 hover:text-red-300"><Trash2 size={15} /></button>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}

export default MyCouponsPage;
