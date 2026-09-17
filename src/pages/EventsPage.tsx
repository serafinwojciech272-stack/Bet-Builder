import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Filter, Search, SlidersHorizontal } from 'lucide-react';
import { useIntelligence } from '../state/IntelligenceProvider';
import { buildEventIntel } from '../state/selectors';
import { MARKET_LABELS, SPORT_LABELS } from '../domain/feed/normalization';
import type { SportKey } from '../domain/types';
import {
  Chip,
  EmptyState,
  ErrorState,
  LoadingState,
  Meter,
  Panel,
  SectionHeading,
  Stat,
} from '../components/ui';
import { cx, relativeTime } from '../lib/format';

type SortKey = 'start' | 'edge' | 'movement' | 'quality';

export function EventsPage() {
  const { dataset, phase, error, refresh, nowTick, analyses } = useIntelligence();
  const [query, setQuery] = useState('');
  const [sport, setSport] = useState<SportKey | 'all'>('all');
  const [monitoredOnly, setMonitoredOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('start');

  const intel = useMemo(() => (dataset ? buildEventIntel(dataset, new Date(nowTick)) : []), [dataset, nowTick]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = intel.filter((i) => {
      if (monitoredOnly && !i.event.monitored) return false;
      if (sport !== 'all' && i.event.sportKey !== sport) return false;
      if (!q) return true;
      return (
        i.event.homeTeam.name.toLowerCase().includes(q) ||
        i.event.awayTeam.name.toLowerCase().includes(q) ||
        i.event.league.name.toLowerCase().includes(q) ||
        i.event.id.toLowerCase().includes(q)
      );
    });
    const bestEdge = (x: typeof rows[number]) =>
      Math.max(...x.value.signals.map((s) => s.edgePct.value), -99);
    return rows.sort((a, b) => {
      switch (sort) {
        case 'edge':
          return bestEdge(b) - bestEdge(a);
        case 'movement':
          return (b.movement?.maxAbsChangePct.value ?? 0) - (a.movement?.maxAbsChangePct.value ?? 0);
        case 'quality':
          return b.quality.score.value - a.quality.score.value;
        default:
          return a.event.startTime.localeCompare(b.event.startTime);
      }
    });
  }, [intel, query, sport, monitoredOnly, sort]);

  const sports = useMemo(
    () => [...new Set(intel.map((i) => i.event.sportKey))],
    [intel],
  );

  if (phase === 'loading' || phase === 'idle') return <LoadingState rows={5} />;
  if (phase === 'error') return <ErrorState detail={error ?? undefined} onRetry={() => void refresh()} />;

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Canonical event explorer"
        subtitle={`${intel.length} normalized events · ${dataset?.snapshots.length ?? 0} odds snapshots · ${dataset?.droppedRecords ?? 0} records dropped during normalization.`}
        icon={<Eye size={18} className="text-ai" aria-hidden />}
      />

      <Panel className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[220px] flex-1 text-[11px] text-faint">
            Search teams, leagues or ids
            <span className="mt-1 flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
              <Search size={13} className="text-faint" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Arsenal, NBA, EVT-SOC-1001…"
                className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-faint"
              />
            </span>
          </label>
          <label className="text-[11px] text-faint">
            Sport
            <select
              value={sport}
              onChange={(e) => setSport(e.target.value as SportKey | 'all')}
              className="mt-1 block rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-xs text-foreground"
            >
              <option value="all">All sports</option>
              {sports.map((s) => (
                <option key={s} value={s}>
                  {SPORT_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-faint">
            Sort by
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="mt-1 block rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-xs text-foreground"
            >
              <option value="start">Start time</option>
              <option value="edge">Best edge</option>
              <option value="movement">Largest movement</option>
              <option value="quality">Feed quality</option>
            </select>
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[11px] text-muted">
            <input
              type="checkbox"
              checked={monitoredOnly}
              onChange={(e) => setMonitoredOnly(e.target.checked)}
              className="h-3.5 w-3.5 accent-[#5ad8ff]"
            />
            <Filter size={12} aria-hidden />
            Monitored only
          </label>
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-faint">
            <SlidersHorizontal size={12} aria-hidden />
            {filtered.length} result{filtered.length === 1 ? '' : 's'}
          </span>
        </div>
      </Panel>

      {filtered.length === 0 ? (
        <EmptyState
          title="No events match your filters"
          detail="Relax the sport filter or clear the search query."
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((i) => {
            const best = [...i.value.signals].sort((a, b) => b.edgePct.value - a.edgePct.value)[0];
            const hasAnalysis = analyses.some((a) => a.eventId === i.event.id);
            return (
              <li key={i.event.id}>
                <Panel className="p-4 transition-colors hover:border-ai/40">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="min-w-[220px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip tone="neutral">{i.event.league.name}</Chip>
                        <Chip tone={i.event.monitored ? 'positive' : 'neutral'}>
                          {i.event.monitored ? 'monitored' : 'passive'}
                        </Chip>
                        {hasAnalysis ? <Chip tone="ai">analysed</Chip> : null}
                      </div>
                      <Link
                        to={`/analysis/${i.event.id}`}
                        className="mt-1.5 block text-sm font-semibold text-foreground hover:text-ai"
                      >
                        {i.event.homeTeam.name} vs {i.event.awayTeam.name}
                      </Link>
                      <p className="text-[11px] text-muted">
                        {MARKET_LABELS[i.market]} · {relativeTime(i.event.startTime, nowTick)} ·{' '}
                        {i.movement?.bookmakersTracked.length ?? 0} books
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
                      <Stat
                        label="Max Δ"
                        tone="market"
                        value={i.movement?.maxAbsChangePct.formatted ?? '—'}
                      />
                      <Stat
                        label="Best edge"
                        tone={(best?.edgePct.value ?? 0) > 0 ? 'positive' : 'default'}
                        value={best?.edgePct.formatted ?? '—'}
                      />
                      <Stat label="Risk" value={i.risk.level} mono={false} />
                      <div className="min-w-[90px]">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-faint">Quality</div>
                        <div className={cx('mt-1 font-mono text-xl font-semibold', i.quality.grade === 'A' ? 'text-positive' : i.quality.grade === 'D' ? 'text-negative' : 'text-market')}>
                          {i.quality.grade}
                        </div>
                        <Meter value={i.quality.score.value} tone="warn" ariaLabel="quality" />
                      </div>
                    </div>
                  </div>
                </Panel>
              </li>
            );
          })}
        </ul>
      )}

      {dataset?.issues.length ? (
        <Panel className="p-5">
          <h3 className="mb-2 text-sm font-semibold">Normalization log</h3>
          <ul className="max-h-60 space-y-1 overflow-y-auto pr-1">
            {dataset.issues.slice(0, 40).map((issue, idx) => (
              <li key={idx} className="flex items-start gap-2 font-mono text-[10px]">
                <span
                  className={cx(
                    'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                    issue.severity === 'error' ? 'bg-negative' : issue.severity === 'warning' ? 'bg-warn' : 'bg-neutral',
                  )}
                />
                <span className="text-faint">{issue.code}</span>
                <span className="text-muted">{issue.message}</span>
                {issue.reference ? <span className="ml-auto text-faint">{issue.reference}</span> : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
