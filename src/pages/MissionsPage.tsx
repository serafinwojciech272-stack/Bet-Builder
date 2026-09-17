import { useState } from 'react';
import { DemoBadge } from '../components/ui';

interface Mission {
  id: string;
  title: string;
  description: string;
  status: 'DRAFT' | 'AWAITING_APPROVAL' | 'APPROVED' | 'EXECUTING' | 'MEASURING' | 'COMPLETED';
  createdAt: string;
  updatedAt: string;
}

const initialMissions: Mission[] = [
  {
    id: 'm1',
    title: 'Analyze today\'s football markets',
    description: 'Demo mission: analyze value across today\'s football markets.',
    status: 'DRAFT',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const STATUSES: Mission['status'][] = [
  'DRAFT',
  'AWAITING_APPROVAL',
  'APPROVED',
  'EXECUTING',
  'MEASURING',
  'COMPLETED',
];

export default function MissionsPage() {
  const [missions, setMissions] = useState<Mission[]>(initialMissions);

  const addMission = () => {
    const m: Mission = {
      id: `m${Date.now()}`,
      title: `New demo mission ${missions.length + 1}`,
      description: 'Demo mission for future Core Engine integration.',
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setMissions((prev) => [...prev, m]);
  };

  const advance = (id: string) => {
    setMissions((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const next = STATUSES[Math.min(STATUSES.indexOf(m.status) + 1, STATUSES.length - 1)];
        return { ...m, status: next, updatedAt: new Date().toISOString() };
      }),
    );
  };

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-6 pb-24 md:pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black tracking-tight text-white">Missions</h1>
        <div className="flex items-center gap-3">
          <DemoBadge label="FUTURE SYSTEM" />
          <button
            type="button"
            onClick={addMission}
            className="rounded-md border border-violet-500/40 bg-violet-500/15 px-3 py-1.5 text-sm font-semibold text-violet-200 hover:bg-violet-500/25"
          >
            New Mission
          </button>
        </div>
      </div>
      <p className="mt-2 text-sm text-slate-400">
        Future mission system for the Core AI Engine. Human approval gate required before execution.
      </p>

      <div className="mt-5 space-y-3">
        {missions.map((m) => (
          <section key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
            <div className="min-w-0">
              <div className="text-sm font-bold text-white">{m.title}</div>
              <div className="text-xs text-slate-400">{m.description}</div>
              <div className="mt-1 text-[11px] text-slate-500">
                Status: {m.status} · Created {new Date(m.createdAt).toLocaleString()}
              </div>
            </div>
            <button
              type="button"
              onClick={() => advance(m.id)}
              className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/10"
            >
              Advance Status
            </button>
          </section>
        ))}
      </div>
    </main>
  );
}
