
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import { useBuilder } from './hooks/useBuilder';
import { TopNav, BottomNav } from './components/TopNav';
import DashboardPage from './pages/DashboardPage';
import SportsPage from './pages/SportsPage';
import LivePage from './pages/LivePage';
import BuilderPage from './pages/BuilderPage';
import EventMarketsPage from './pages/EventMarketsPage';
import AnalysisPage from './pages/AnalysisPage';
import HistoryPage from './pages/HistoryPage';
import MissionsPage from './pages/MissionsPage';

function AppInner() {
  const builder = useBuilder();
  const { id } = useParams<{ id: string }>();

  return (
    <div className="min-h-screen bg-[#0b0d12] text-slate-100">
      <TopNav builderCount={builder.selections.length} />
      <div className="pb-20 md:pb-0">
        <Routes>
          <Route path="/" element={<DashboardPage builderCount={builder.selections.length} />} />
          <Route path="/sports" element={<SportsPage />} />
          <Route
            path="/sports/:id"
            element={
              <EventMarketsPage
                addSelection={builder.add}
                removeSelection={builder.remove}
                isAdded={(sid) => builder.selections.some((s) => s.id === sid)}
              />
            }
          />
          <Route path="/live" element={<LivePage />} />
          <Route
            path="/builder"
            element={
              <BuilderPage
                selections={builder.selections}
                stake={builder.stake}
                addSelection={builder.add}
                removeSelection={builder.remove}
                clear={builder.clear}
                updateStake={builder.updateStake}
              />
            }
          />
          <Route path="/analysis" element={<AnalysisPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/missions" element={<MissionsPage />} />
          <Route path="*" element={<DashboardPage builderCount={builder.selections.length} />} />
        </Routes>
      </div>
      <BottomNav builderCount={builder.selections.length} />
      {/* keep id referenced for future per-event builder state */}
      <span className="hidden">{id ?? ''}</span>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}
