import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { IntelligenceProvider } from './state/IntelligenceProvider';
import { AppShell } from './components/AppShell';
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const EventsPage = lazy(() => import('./pages/EventsPage').then(m => ({ default: m.EventsPage })));
const SportsPage = lazy(() => import('./pages/SportsPage'));
const LivePage = lazy(() => import('./pages/LivePage'));
const AnalysisPage = lazy(() => import('./pages/AnalysisPage'));
const EventAnalysisPage = lazy(() => import('./pages/EventAnalysisPage').then(m => ({ default: m.EventAnalysisPage })));
const MissionsPage = lazy(() => import('./pages/MissionsPage').then(m => ({ default: m.MissionsPage })));
const MissionDetailPage = lazy(() => import('./pages/MissionDetailPage').then(m => ({ default: m.MissionDetailPage })));
const HistoryPage = lazy(() => import('./pages/HistoryPage').then(m => ({ default: m.HistoryPage })));
const BuilderPage = lazy(() => import('./pages/BuilderPage'));
import { useBuilder } from './hooks/useBuilder';

function BuilderRoute() {
  const builder = useBuilder();
  return <BuilderPage selections={builder.selections} stake={builder.stake} addSelection={builder.add} removeSelection={builder.remove} clear={builder.clear} updateStake={builder.updateStake} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <IntelligenceProvider>
        <AppShell>
          <Suspense fallback={<div className="flex min-h-[50vh] items-center justify-center"><div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 font-mono text-[10px] uppercase tracking-[.18em] text-white/50">Loading Bet Builder intelligence…</div></div>}>
            <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/sports" element={<SportsPage />} />
            <Route path="/sports/:eventId" element={<EventAnalysisPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/live" element={<LivePage />} />
            <Route path="/builder" element={<BuilderRoute />} />
            <Route path="/analysis" element={<AnalysisPage />} />
            <Route path="/analysis/:eventId" element={<EventAnalysisPage />} />
            <Route path="/missions" element={<MissionsPage />} />
            <Route path="/missions/:missionId" element={<MissionDetailPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </AppShell>
      </IntelligenceProvider>
    </BrowserRouter>
  );
}
