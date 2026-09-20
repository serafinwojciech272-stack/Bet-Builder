import { useMemo, useState } from 'react';
import { ArrowUpRight, CheckCircle2, Loader2, Radar, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useIntelligence } from '../state/IntelligenceProvider';
import type { MissionStatus } from '../missions/types';
import { MISSION_STATUS_ORDER } from '../missions/types';
import { MissionCard } from '../components/MissionUI';
import { Chip, EmptyState, ErrorState, LoadingState, Panel, SectionHeading, Stat } from '../components/ui';
import { cx } from '../lib/format';

const ALL_STATUSES: MissionStatus[] = [...MISSION_STATUS_ORDER, 'FAILED', 'CANCELLED'];

export function MissionsPage() {
  const { missions, phase, error, refresh, nowTick } = useIntelligence();
  const [status, setStatus] = useState<MissionStatus | 'all'>('all');
  const [e2eState, setE2eState] = useState<'idle' | 'running' | 'pass' | 'fail'>('idle');
  const [e2eMessage, setE2eMessage] = useState<string | null>(null);

  async function runProductionE2E() {
    setE2eState('running');
    setE2eMessage(null);
    try {
      const candidates = Object.keys(localStorage).filter((key) => key.includes('auth-token'));
      let accessToken: string | null = null;
      for (const key of candidates) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as { access_token?: string; currentSession?: { access_token?: string } };
          accessToken = parsed.access_token ?? parsed.currentSession?.access_token ?? null;
          if (accessToken) break;
        } catch {
          // Ignore unrelated localStorage entries.
        }
      }
      if (!accessToken) {
        setE2eState('fail');
        setE2eMessage('Brak aktywnej sesji Supabase. Zaloguj się przed uruchomieniem production E2E.');
        return;
      }

      const response = await fetch('/api/core-engine-persistence-e2e', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body = await response.json() as { status?: string; checks?: { authentication?: string; rlsProbe?: { enforced?: boolean } }; error?: string };
      const passed = response.ok && body.status === 'PASS';
      setE2eState(passed ? 'pass' : 'fail');
      setE2eMessage(
        passed
          ? `PASS · ${body.checks?.authentication ?? 'SUPABASE_USER'} · RLS boundary verified`
          : body.error ?? `E2E failed (HTTP ${response.status})`,
      );
    } catch (error) {
      setE2eState('fail');
      setE2eMessage(error instanceof Error ? error.message : 'Production E2E request failed');
    }
  }

  const counts = useMemo(() => {
    const map = new Map<MissionStatus, number>();
    for (const mission of missions) {
      map.set(mission.status, (map.get(mission.status) ?? 0) + 1);
    }
    return map;
  }, [missions]);

  const filtered = useMemo(() => {
    if (status === 'all') return missions;
    return missions.filter((mission) => mission.status === status);
  }, [missions, status]);

  const ledgerStats = useMemo(() => {
    const entries = missions.map((mission) => mission.decisionLedger).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    const settled = entries.filter((entry) => entry.settlement.status !== 'PENDING');
    const measuredClv = entries.filter((entry) => entry.clv.measured);
    const positiveClv = measuredClv.filter((entry) => (entry.clv.valuePct ?? 0) > 0);
    return {
      total: entries.length,
      pending: entries.filter((entry) => entry.settlement.status === 'PENDING').length,
      settled: settled.length,
      positiveClvRate: measuredClv.length ? positiveClv.length / measuredClv.length : null,
    };
  }, [missions]);

  if (phase === 'loading' || phase === 'idle') {
    return <LoadingState rows={4} />;
  }

  if (phase === 'error') {
    return <ErrorState detail={error ?? undefined} onRetry={() => void refresh()} />;
  }

  return (
    <div className="space-y-8 rise">
      <section className="relative overflow-hidden rounded-2xl border border-mission/20 bg-gradient-to-br from-mission/[.10] via-surface to-surface-2 p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-mission/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <Chip tone="mission"><Radar size={11} /> Core Engine workflow</Chip>
            <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Mission control</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Governed workflow for observation, approval, execution and measurement. Human approval remains the control boundary.
            </p>
          </div>
          <Chip tone="positive"><ShieldCheck size={11} /> observation-only build</Chip>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Panel className="p-4"><Stat label="Total" value={missions.length} /></Panel>
        <Panel className="p-4"><Stat label="Awaiting approval" value={counts.get('AWAITING_APPROVAL') ?? 0} tone="ai" /></Panel>
        <Panel className="p-4"><Stat label="Completed" value={counts.get('COMPLETED') ?? 0} tone="positive" /></Panel>
        <Panel className="p-4"><Stat label="Failed / cancelled" value={(counts.get('FAILED') ?? 0) + (counts.get('CANCELLED') ?? 0)} tone="negative" /></Panel>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Panel className="p-4"><Stat label="Decision Ledger" value={ledgerStats.total} hint="mission-linked packets" /></Panel>
        <Panel className="p-4"><Stat label="Ledger pending" value={ledgerStats.pending} tone="ai" hint="awaiting settlement" /></Panel>
        <Panel className="p-4"><Stat label="Ledger settled" value={ledgerStats.settled} tone="positive" hint="terminal settlement" /></Panel>
        <Panel className="p-4"><Stat label="Positive CLV rate" value={ledgerStats.positiveClvRate === null ? '—' : `${(ledgerStats.positiveClvRate * 100).toFixed(0)}%`} hint="measured CLV samples" /></Panel>
      </section>

      <section>
        <Panel className="border border-mission/20 bg-mission/[.04] p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              {e2eState === 'pass' ? <CheckCircle2 className="mt-0.5 text-positive" size={18} /> : e2eState === 'fail' ? <ShieldAlert className="mt-0.5 text-negative" size={18} /> : <ShieldCheck className="mt-0.5 text-mission" size={18} />}
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[.16em] text-mission">Production E2E hardening</div>
                <div className="mt-1 text-sm font-semibold text-foreground">Lifecycle → API → Supabase → recovery</div>
                <div className="mt-1 text-xs text-muted">Runs only with the current authenticated Supabase session. No client-side secret is used.</div>
                {e2eMessage && <div className="mt-2 text-xs text-muted">{e2eMessage}</div>}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void runProductionE2E()}
              disabled={e2eState === 'running'}
              className="inline-flex items-center gap-2 rounded-xl bg-mission px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[.12em] text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
            >
              {e2eState === 'running' ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              {e2eState === 'running' ? 'Running…' : 'Run production E2E'}
            </button>
          </div>
        </Panel>
      </section>

      <section>
        <SectionHeading
          index="01"
          title="Mission queue"
          subtitle="Filter the governed workflow by lifecycle state."
          icon={<Radar size={17} className="text-mission" />}
        />
        <div role="tablist" aria-label="Mission status" className="mb-4 flex flex-wrap gap-1">
          {(['all', ...ALL_STATUSES] as Array<MissionStatus | 'all'>).map((item) => {
            const active = status === item;
            const count = item === 'all' ? missions.length : counts.get(item) ?? 0;
            return (
              <button
                key={item}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setStatus(item)}
                className={cx(
                  'rounded-lg px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.1em] transition-colors',
                  active
                    ? 'bg-mission/15 text-mission ring-1 ring-mission/40'
                    : 'bg-surface-2 text-faint ring-1 ring-line hover:text-foreground',
                )}
              >
                {item === 'all' ? 'all' : item.replace(/_/g, ' ')} {count}
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title="No missions in this state"
            detail="Create a governed mission from an event analysis."
            action={<Link to="/" className="text-xs text-ai hover:underline">Open intelligence dashboard →</Link>}
          />
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {filtered.map((mission) => (
              <li key={mission.id}>
                <MissionCard
                  mission={mission}
                  nowTick={nowTick}
                  footer={
                    <Link to={`/missions/${mission.id}`} className="inline-flex items-center gap-1 text-xs text-mission hover:underline">
                      Open mission <ArrowUpRight size={12} />
                    </Link>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
