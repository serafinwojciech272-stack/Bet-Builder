import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Eye, Filter, Search, Swords, Trophy, Zap as ZapIcon } from 'lucide-react';
import { useIntelligence } from '../state/IntelligenceProvider';
import { buildEventIntel } from '../state/selectors';
import { MARKET_LABELS, SPORT_LABELS } from '../domain/feed/normalization';
import type { SportKey } from '../domain/types';
import { Chip, EmptyState, ErrorState, LoadingState, Panel, SectionHeading, Stat } from '../components/ui';
import { dateTime, relativeTime } from '../lib/format';
import { AICommandCenter } from '../components/AICommandCenter';

type SortKey = 'start' | 'edge' | 'movement';

function localDateValue(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function EventsPage() {
  const { dataset, phase, error, refresh, nowTick, analyses, selectedDate } = useIntelligence();
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
      return !q || i.event.homeTeam.name.toLowerCase().includes(q) || i.event.awayTeam.name.toLowerCase().includes(q) || i.event.league.name.toLowerCase().includes(q);
    });
    const bestEdge = (x: typeof rows[number]) => Math.max(...x.value.signals.map((s) => s.edgePct.value), -99);
    return rows.sort((a, b) => sort === 'edge' ? bestEdge(b) - bestEdge(a) : sort === 'movement' ? (b.movement?.maxAbsChangePct.value ?? 0) - (a.movement?.maxAbsChangePct.value ?? 0) : a.event.startTime.localeCompare(b.event.startTime));
  }, [intel, query, sport, monitoredOnly, sort]);
  const sports = useMemo(() => [...new Set(intel.map((i) => i.event.sportKey))], [intel]);

  if (phase === 'loading' || phase === 'idle') return <LoadingState label="Ładowanie wydarzeń…" rows={5} />;
  if (phase === 'error') return <ErrorState title="Nie udało się pobrać wydarzeń" detail={error ?? undefined} onRetry={() => void refresh()} retryLabel="Spróbuj ponownie" />;

  return (
    <div className="space-y-7">
      <section className="bb-command-hero rise">
        <div className="bb-hero-grid" aria-hidden="true" />
        <div className="bb-hero-orb" aria-hidden="true"><span /><span /><span /></div>
        <div className="bb-hero-copy">
          <div className="bb-eyebrow"><span className="club-spark" /> BET BUILDER · PRIVATE INTELLIGENCE CLUB <span className="bb-live-pill"><span className="live-dot" /> LIVE ENGINE</span></div>
          <h1 className="bb-hero-title">Od kursu do decyzji.<br/><span>Bez chaosu. Z inteligencją.</span></h1>
          <p className="bb-hero-lead">Jedna powierzchnia łączy live markets, deterministic intelligence, AI analysis i mission execution. Zbuduj kupon jak operator, nie jak przypadkowy gracz.</p>
          <div className="bb-hero-actions">
            <Link to="/builder" className="club-primary-cta"><ZapIcon /> Otwórz Bet Builder</Link>
            <Link to="/analysis" className="club-secondary-cta"><Eye size={14} /> Intelligence Center</Link>
          </div>
          <div className="bb-proof-row">
            <span><b>{filtered.length || '—'}</b> events monitored</span><i /> <span><b>{dataset?.snapshots.length ?? '—'}</b> market snapshots</span><i /> <span><b>{dataset?.mode === 'LIVE' ? 'LIVE' : 'DEMO'}</b> feed integrity</span>
          </div>
        </div>
        <div className="bb-hero-console">
          <div className="bb-console-top"><span><span className="club-signal-dot" /> CORE ENGINE</span><span>v1.0</span></div>
          <div className="bb-console-ring"><div><strong>READY</strong><small>decision layer</small></div></div>
          <div className="bb-console-lines"><span><b>01</b> INGEST <em>OK</em></span><span><b>02</b> NORMALIZE <em>OK</em></span><span><b>03</b> INTELLIGENCE <em>READY</em></span><span><b>04</b> EXECUTION <em>GATED</em></span></div>
        </div>
      </section>

      <section className="bb-decision-ribbon rise" aria-label="Łańcuch inteligencji">
        <div className="bb-decision-node" data-tone="ai"><small>01 · INGEST</small><strong>LIVE FEED</strong><span>kursy, eventy, snapshoty</span></div>
        <div className="bb-decision-node" data-tone="ai"><small>02 · NORMALIZE</small><strong>ONE MODEL</strong><span>spójny kontrakt danych</span></div>
        <div className="bb-decision-node" data-tone="gold"><small>03 · INTELLIGENCE</small><strong>EDGE ENGINE</strong><span>value · risk · movement</span></div>
        <div className="bb-decision-node" data-tone="green"><small>04 · DECISION</small><strong>CONTROL GATE</strong><span>evidence przed akcją</span></div>
        <div className="bb-decision-node" data-tone="red"><small>05 · MISSION</small><strong>HUMAN APPROVAL</strong><span>execute → measure → learn</span></div>
      </section>

      <AICommandCenter />

      <SectionHeading title="Wydarzenia sportowe" subtitle="Wybierz wydarzenie. Silnik przeprowadzi Cię od danych rynkowych przez analizę do decyzji." icon={<Eye size={18} className="text-ai" aria-hidden />} />
      <Panel className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[220px] flex-1 text-[11px] text-faint">Szukaj drużyny lub ligi
            <span className="mt-1 flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-2">
              <Search size={13} className="text-faint" aria-hidden /><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="np. Arsenal, NBA…" className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-faint" />
            </span>
          </label>
          <label className="text-[11px] text-faint">Data
            <span className="mt-1 flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
              <CalendarDays size={13} className="text-ai" aria-hidden /><input type="date" value={selectedDate} onChange={(e) => { if (e.target.value) void refresh(e.target.value, true); }} className="bg-transparent text-xs text-foreground outline-none" />
            </span>
          </label>
          <button type="button" onClick={() => void refresh(localDateValue(), true)} className="rounded-lg border border-ai/30 bg-ai/10 px-3 py-2 text-[11px] font-medium text-ai">Dzisiaj</button>
          <label className="text-[11px] text-faint">Dyscyplina
            <select value={sport} onChange={(e) => setSport(e.target.value as SportKey | 'all')} className="mt-1 block rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-xs text-foreground">
              <option value="all">Wszystkie</option>{sports.map((s) => <option key={s} value={s}>{SPORT_LABELS[s]}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-faint">Sortuj
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="mt-1 block rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-xs text-foreground">
              <option value="start">Godzina</option><option value="edge">Wartość</option><option value="movement">Ruch kursu</option>
            </select>
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[11px] text-muted"><input type="checkbox" checked={monitoredOnly} onChange={(e) => setMonitoredOnly(e.target.checked)} /> <Filter size={12} /> Tylko monitorowane</label>
          <span className="ml-auto text-[11px] text-faint">{filtered.length} wydarzeń</span>
        </div>
      </Panel>

      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-semibold text-foreground">{selectedDate}</h2><p className="text-xs text-muted">{dataset?.mode === 'LIVE' ? 'Dane z aktualnego źródła kursów' : 'Tryb demonstracyjny — źródło live niedostępne'}</p></div>
        <Chip tone={dataset?.mode === 'LIVE' ? 'positive' : 'warn'}>{dataset?.mode === 'LIVE' ? 'LIVE' : 'DEMO'}</Chip>
      </div>

      {filtered.length === 0 ? <EmptyState title="Brak wydarzeń dla wybranych filtrów" detail="Zmień datę, dyscyplinę albo wyszukiwanie." /> : (
        <ul className="space-y-3">{filtered.map((i) => {
          const best = [...i.value.signals].sort((a, b) => b.edgePct.value - a.edgePct.value)[0];
          const hasAnalysis = analyses.some((a) => a.eventId === i.event.id);
          const isLive = i.event.status === 'live';
          return <li key={i.event.id}><Panel className="p-4 transition-colors hover:border-ai/40">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone="neutral">{SPORT_LABELS[i.event.sportKey]}</Chip>
                  <Chip tone={isLive ? 'negative' : 'positive'}>{isLive ? 'NA ŻYWO' : 'NADCHODZĄCE'}</Chip>
                  {hasAnalysis ? <Chip tone="ai">ANALIZA GOTOWA</Chip> : null}
                </div>
                <Link to={`/analysis/${i.event.id}`} className="mt-2 block text-lg font-semibold text-foreground hover:text-ai">{i.event.homeTeam.name} <span className="text-faint">vs</span> {i.event.awayTeam.name}</Link>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border border-line bg-surface-2 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] text-faint"><Trophy size={11} className="text-ai" /> League</div>
                    <div className="mt-1 text-xs font-semibold text-foreground">{i.event.league.name}</div>
                  </div>
                  <div className="rounded-lg border border-line bg-surface-2 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] text-faint"><Swords size={11} className="text-market" /> Event</div>
                    <div className="mt-1 text-xs font-semibold text-foreground">{isLive ? 'Live event' : 'Scheduled event'}</div>
                  </div>
                  <div className="rounded-lg border border-line bg-surface-2 px-3 py-2">
                    <div className="text-[9px] uppercase tracking-[0.12em] text-faint">Market</div>
                    <div className="mt-1 text-xs font-semibold text-market">{MARKET_LABELS[i.market]}</div>
                  </div>
                </div>
                <p className="mt-2 text-xs font-medium text-foreground"><CalendarDays size={12} className="mr-1 inline text-ai" />{dateTime(i.event.startTime)} <span className="text-faint">· {relativeTime(i.event.startTime, nowTick)}</span></p>
              </div>
              <div className="flex flex-col justify-between gap-3 lg:w-[280px]">
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Najlepszy kurs" value={best?.bestPrice.formatted ?? '—'} tone="market" />
                  <Stat label="Wartość" value={best?.edgePct.formatted ?? '—'} tone={(best?.edgePct.value ?? 0) > 0 ? 'positive' : 'default'} />
                  <Stat label="Ryzyko" value={i.risk.level === 'LOW' ? 'NISKIE' : i.risk.level === 'ELEVATED' ? 'PODWYŻSZONE' : i.risk.level === 'HIGH' ? 'WYSOKIE' : 'KRYTYCZNE'} mono={false} />
                </div>
                <Link to={`/analysis/${i.event.id}`} className="inline-flex items-center justify-center rounded-lg border border-ai/30 bg-ai/10 px-3 py-2 text-[11px] font-semibold text-ai hover:bg-ai/15">Analyze event →</Link>
              </div>
            </div>
          </Panel></li>;
        })}</ul>
      )}
      {dataset?.mode === 'DEMO' ? <Panel className="border-warn/30 bg-warn/[.05] p-4"><p className="text-xs text-warn"><strong>Uwaga:</strong> pokazany zestaw jest demonstracyjny. Aplikacja nie będzie udawać danych live, jeśli API kursów nie odpowiada.</p></Panel> : null}
    </div>
  );
}