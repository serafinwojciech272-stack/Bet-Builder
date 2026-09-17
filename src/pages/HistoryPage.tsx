import { useMemo } from 'react';
import { getDataset } from '../services/services';
import { DemoBadge } from '../components/ui';

export default function HistoryPage() {
  const dataset = getDataset();
  const rows = useMemo(
    () =>
      dataset.selections.slice(0, 12).map((s, i) => ({
        id: `H${i}`,
        date: new Date(Date.now() - (i + 1) * 3600_000).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
        sport: dataset.events.find((e) => e.id === s.eventId)?.sport ?? 'Football',
        selections: s.shortName,
        odds: s.odds,
        stake: 25,
        potentialReturn: 25 * s.odds,
        risk: s.risk,
        status: i % 3 === 0 ? 'PENDING' : i % 3 === 1 ? 'WON' : 'LOST',
      })),
    [dataset],
  );

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-6 pb-24 md:pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black tracking-tight text-white">History</h1>
        <DemoBadge label="DEMO STATE" />
      </div>

      <div className="mt-5 overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="bg-white/5 text-left text-[11px] uppercase tracking-wider text-slate-400">
              {['Date', 'Sport', 'Selection', 'Odds', 'Stake', 'Pot. Return', 'Risk', 'Status'].map((h) => (
                <th key={h} className="px-3 py-2.5 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-white/5 text-slate-200">
                <td className="px-3 py-2.5">{r.date}</td>
                <td className="px-3 py-2.5">{r.sport}</td>
                <td className="px-3 py-2.5">{r.selections}</td>
                <td className="px-3 py-2.5">{r.odds.toFixed(2)}</td>
                <td className="px-3 py-2.5">{r.stake.toFixed(2)}</td>
                <td className="px-3 py-2.5">{r.potentialReturn.toFixed(2)}</td>
                <td className="px-3 py-2.5">{r.risk}</td>
                <td className="px-3 py-2.5">
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${
                      r.status === 'WON'
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                        : r.status === 'LOST'
                          ? 'border-red-500/40 bg-red-500/10 text-red-300'
                          : 'border-slate-500/40 bg-slate-500/10 text-slate-300'
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
