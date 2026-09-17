import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { IntelligenceProvider } from './state/IntelligenceProvider';
import { AppShell } from './components/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { EventsPage } from './pages/EventsPage';
import { EventAnalysisPage } from './pages/EventAnalysisPage';
import { MissionsPage } from './pages/MissionsPage';
import { MissionDetailPage } from './pages/MissionDetailPage';
import { HistoryPage } from './pages/HistoryPage';
import BuilderPage from './pages/BuilderPage';
import { useBuilder } from './hooks/useBuilder';

function BuilderRoute() {
  const builder = useBuilder();
  return (
    <BuilderPage
      selections={builder.selections}
      stake={builder.stake}
      addSelection={builder.add}
      removeSelection={builder.remove}
      clear={builder.clear}
      updateStake={builder.updateStake}
    />
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <IntelligenceProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/builder" element={<BuilderRoute />} />
            <Route path="/analysis/:eventId" element={<EventAnalysisPage />} />
            <Route path="/missions" element={<MissionsPage />} />
            <Route path="/missions/:missionId" element={<MissionDetailPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </IntelligenceProvider>
    </BrowserRouter>
  );
}
