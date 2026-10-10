import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, X } from 'lucide-react';
import { useSlip } from '../state/SlipProvider';

/** Floating slip summary shown while browsing matches; hidden on the coupon screen itself. */
export function SlipDock() {
  const { picks, combinedOdds, clear } = useSlip();
  const { pathname } = useLocation();
  if (!picks.length || pathname.startsWith('/builder') || pathname.startsWith('/coupon')) return null;
  const chance = picks.reduce((p, x) => p * x.probability, 1);
  return (
    <div className="fl-dock fl-dock-enter flex items-center gap-3 p-2.5 pl-3" role="region" aria-label="Twój kupon">
      <span key={picks.length} className="fl-dock__count fl-bump" aria-label={`${picks.length} typów`}>{picks.length}</span>
      <div className="min-w-0 flex-1">
        <div className="hidden text-[10px] font-black uppercase tracking-[.18em] text-slate-400 min-[420px]:block">Twój kupon</div>
        <div className="flex items-baseline gap-2">
          <span key={combinedOdds.toFixed(2)} className="fl-display fl-flip text-2xl text-amber-200">{combinedOdds.toFixed(2)}</span>
          <span className="hidden truncate text-[11px] text-slate-400 min-[420px]:inline">szansa {(chance * 100).toFixed(chance < 0.1 ? 1 : 0)}%</span>
        </div>
      </div>
      <button type="button" onClick={clear} aria-label="Wyczyść kupon" className="fl-btn grid w-11 place-items-center text-slate-400 hover:text-white"><X size={16} /></button>
      <Link to="/builder" className="fl-btn fl-cta inline-flex items-center gap-1.5 px-4 text-xs font-black uppercase tracking-[.1em]">
        <span className="hidden min-[360px]:inline">Do kuponu</span> <ArrowRight size={14} />
      </Link>
    </div>
  );
}
