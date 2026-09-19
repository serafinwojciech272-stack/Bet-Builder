import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CanonicalDataset } from '../domain/repositories';
import type { MarketKey } from '../domain/types';
import type { AnalysisRecord } from '../ai/AnalysisRepository';
import type { AnalysisResponse, RecommendedAction } from '../ai/contracts';
import { AnalysisError } from '../ai/AIAnalysisService';
import type { Mission } from '../missions/types';
import type { OptimizationRequest, OptimizationResult } from '../core/types';
import { buildMissionFromAnalysis, type MissionDraftOptions } from '../missions/missionFactory';
import { MissionTransitionError } from '../missions/stateMachine';
import { createWorkspace, type Workspace } from './services';
import { seedWorkspace } from './seed';

export type LoadPhase = 'idle' | 'loading' | 'ready' | 'error';
export interface Toast { id: string; tone: 'success' | 'error' | 'info'; title: string; detail?: string; }
export interface AnalysisJobState { status: 'idle' | 'loading' | 'error'; error?: string; retryable?: boolean; }
export interface EngineStatus { aiEngineId: string; aiOnline: boolean; aiDetail: string; coreEngineId: string; coreVersion: string; monetaryExecution: boolean; portfolioOptimization: boolean; }
interface IntelligenceValue {
  phase: LoadPhase; error: string | null; dataset: CanonicalDataset | null; analyses: AnalysisRecord[]; missions: Mission[]; engine: EngineStatus | null;
  analysisJobs: Record<string, AnalysisJobState>; busyMissionIds: string[]; toasts: Toast[]; lastRefreshedAt: string | null; selectedDate: string; nowTick: number; operator: string;
  refresh: (date?: string, forceRefresh?: boolean, sport?: string) => Promise<void>;
  runAnalysis: (eventId: string, options?: { market?: MarketKey; depth?: 'standard' | 'deep' }) => Promise<AnalysisResponse | null>;
  optimizeBuilder: (request: OptimizationRequest) => Promise<OptimizationResult | null>;
  createMission: (analysis: AnalysisResponse, action: RecommendedAction, options?: MissionDraftOptions) => Promise<Mission | null>;
  toggleCheck: (missionId: string, checkId: string) => Promise<void>; requestApproval: (missionId: string) => Promise<void>;
  approveMission: (missionId: string, note: string) => Promise<void>; rejectMission: (missionId: string, note: string) => Promise<void>;
  cancelMission: (missionId: string, reason: string) => Promise<void>; executeMission: (missionId: string) => Promise<void>;
  simulateEngineFailure: () => void; dismissToast: (id: string) => void;
}
const IntelligenceContext = createContext<IntelligenceValue | null>(null);
function localDate() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }

export function IntelligenceProvider({ children }: { children: ReactNode }) {
  const workspaceRef = useRef<Workspace | null>(null); if (!workspaceRef.current) workspaceRef.current = createWorkspace(); const workspace = workspaceRef.current;
  const [phase, setPhase] = useState<LoadPhase>('idle'); const [error, setError] = useState<string | null>(null); const [dataset, setDataset] = useState<CanonicalDataset | null>(null);
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]); const [missions, setMissions] = useState<Mission[]>([]); const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [analysisJobs, setAnalysisJobs] = useState<Record<string, AnalysisJobState>>({}); const [busyMissionIds, setBusyMissionIds] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]); const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null); const [selectedDate, setSelectedDate] = useState(localDate); const [nowTick, setNowTick] = useState(() => Date.now());
  const seedPromiseRef = useRef<Promise<unknown> | null>(null); const operator = 'j.moreau';
  const pushToast = useCallback((toast: Omit<Toast, 'id'>) => { const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; setToasts((p) => [...p, { ...toast, id }]); window.setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 6000); }, []);
  const dismissToast = useCallback((id: string) => setToasts((p) => p.filter((t) => t.id !== id)), []);
  const syncStores = useCallback(async () => { const [a, m] = await Promise.all([workspace.analysisRepository.list(), workspace.missionRepository.list()]); setAnalyses(a); setMissions(m); }, [workspace]);
  const refresh = useCallback(async (date = selectedDate, forceRefresh = false, sport = 'all') => {
    setPhase('loading'); setError(null); setSelectedDate(date);
    try {
      const data = await workspace.dataRepository.loadCanonicalDataset({ date, forceRefresh, sport });
      setDataset(data);
      if (!seedPromiseRef.current) seedPromiseRef.current = seedWorkspace(workspace);
      await seedPromiseRef.current;
      await syncStores();
      setLastRefreshedAt(new Date().toISOString());
      // Data availability is the critical path. AI/Core health is observability,
      // so do not block the event board while those checks complete.
      setPhase('ready');
      void Promise.all([workspace.analysisService.health(), workspace.coreEngine.capabilities()])
        .then(([health, caps]) => setEngine({ aiEngineId: health.engineId, aiOnline: health.ok, aiDetail: health.detail, coreEngineId: caps.engineId, coreVersion: caps.version, monetaryExecution: caps.supportsMonetaryExecution, portfolioOptimization: caps.supportsPortfolioOptimization }))
        .catch(() => undefined);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown bootstrap failure'); setPhase('error'); }
  }, [workspace, selectedDate, syncStores]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { const id = window.setInterval(() => setNowTick(Date.now()), 30000); return () => window.clearInterval(id); }, []);
  const runAnalysis = useCallback<IntelligenceValue['runAnalysis']>(async (eventId, options) => {
    setAnalysisJobs((p) => ({ ...p, [eventId]: { status: 'loading' } }));
    try { const analysis = await workspace.analysisService.analyzeEvent({ eventId, market: options?.market, depth: options?.depth ?? 'standard', requestedBy: operator }); await workspace.analysisRepository.save(analysis); await syncStores(); setAnalysisJobs((p) => ({ ...p, [eventId]: { status: 'idle' } })); pushToast({ tone: 'success', title: 'Analysis complete', detail: `${analysis.context.eventLabel} · confidence ${(analysis.confidence.score.value * 100).toFixed(0)}%` }); return analysis; }
    catch (e) { const message = e instanceof Error ? e.message : 'Analysis failed'; setAnalysisJobs((p) => ({ ...p, [eventId]: { status: 'error', error: message, retryable: e instanceof AnalysisError ? e.retryable : true } })); pushToast({ tone: 'error', title: 'Analysis failed', detail: message }); return null; }
  }, [workspace, syncStores, pushToast]);
  const optimizeBuilder = useCallback<IntelligenceValue['optimizeBuilder']>(async (request) => {
    try { return await workspace.coreEngine.optimizeBuilder(request); }
    catch (e) { pushToast({ tone: 'error', title: 'Core optimization failed', detail: e instanceof Error ? e.message : 'Unknown optimization error' }); return null; }
  }, [workspace, pushToast]);
  const withMissionBusy = useCallback(async (missionId: string, fn: () => Promise<void>) => {
    setBusyMissionIds((p) => [...p, missionId]); try { await fn(); } catch (e) { const message = e instanceof MissionTransitionError ? `${e.code}: ${e.message}` : e instanceof Error ? e.message : 'Mission operation failed'; pushToast({ tone: 'error', title: 'Mission blocked', detail: message }); } finally { setBusyMissionIds((p) => p.filter((id) => id !== missionId)); await syncStores(); }
  }, [pushToast, syncStores]);
  const createMission = useCallback<IntelligenceValue['createMission']>(async (analysis, action, options) => {
    try { const mission = buildMissionFromAnalysis(analysis, action, { createdBy: operator, ...options }); await workspace.missionService.saveDraft(mission); await syncStores(); pushToast({ tone: 'success', title: 'Mission drafted', detail: `${mission.id} created in DRAFT — approval required before execution.` }); return mission; }
    catch (e) { pushToast({ tone: 'error', title: 'Could not draft mission', detail: e instanceof Error ? e.message : 'Unknown error' }); return null; }
  }, [workspace, syncStores, pushToast]);
  const toggleCheck = useCallback<IntelligenceValue['toggleCheck']>(async (missionId, checkId) => { await withMissionBusy(missionId, async () => { await workspace.missionService.toggleChecklistItem(missionId, checkId, operator); }); }, [workspace, withMissionBusy]);
  const requestApproval = useCallback<IntelligenceValue['requestApproval']>(async (missionId) => withMissionBusy(missionId, async () => { await workspace.missionService.requestApproval(missionId, operator); pushToast({ tone: 'info', title: 'Sent to approval gate', detail: missionId }); }), [workspace, withMissionBusy, pushToast]);
  const approveMission = useCallback<IntelligenceValue['approveMission']>(async (missionId, note) => withMissionBusy(missionId, async () => { await workspace.missionService.approve(missionId, operator, note); pushToast({ tone: 'success', title: 'Mission approved', detail: `${missionId} may now execute.` }); }), [workspace, withMissionBusy, pushToast]);
  const rejectMission = useCallback<IntelligenceValue['rejectMission']>(async (missionId, note) => withMissionBusy(missionId, async () => { await workspace.missionService.reject(missionId, operator, note); pushToast({ tone: 'info', title: 'Mission rejected', detail: `${missionId} cancelled at the gate.` }); }), [workspace, withMissionBusy, pushToast]);
  const cancelMission = useCallback<IntelligenceValue['cancelMission']>(async (missionId, reason) => withMissionBusy(missionId, async () => { await workspace.missionService.cancel(missionId, operator, reason); pushToast({ tone: 'info', title: 'Mission cancelled', detail: missionId }); }), [workspace, withMissionBusy, pushToast]);
  const executeMission = useCallback<IntelligenceValue['executeMission']>(async (missionId) => withMissionBusy(missionId, async () => { const result = await workspace.missionService.execute(missionId, operator); pushToast({ tone: result.status === 'COMPLETED' ? 'success' : 'error', title: result.status === 'COMPLETED' ? 'Mission completed' : 'Mission failed', detail: result.measurement ? `Verdict ${result.measurement.verdict} · CLV ${result.measurement.closingLineValuePct.formatted}` : result.execution?.failureReason ?? undefined }); }), [workspace, withMissionBusy, pushToast]);
  const simulateEngineFailure = useCallback(() => { workspace.setFailNextAnalysis(true); pushToast({ tone: 'info', title: 'Fault injected', detail: 'The next analysis request will fail so you can exercise the retry path.' }); }, [workspace, pushToast]);
  const value = useMemo<IntelligenceValue>(() => ({ phase, error, dataset, analyses, missions, engine, analysisJobs, busyMissionIds, toasts, lastRefreshedAt, selectedDate, nowTick, operator, refresh, runAnalysis, optimizeBuilder, createMission, toggleCheck, requestApproval, approveMission, rejectMission, cancelMission, executeMission, simulateEngineFailure, dismissToast }), [phase, error, dataset, analyses, missions, engine, analysisJobs, busyMissionIds, toasts, lastRefreshedAt, selectedDate, nowTick, operator, refresh, runAnalysis, optimizeBuilder, createMission, toggleCheck, requestApproval, approveMission, rejectMission, cancelMission, executeMission, simulateEngineFailure, dismissToast]);
  return <IntelligenceContext.Provider value={value}>{children}</IntelligenceContext.Provider>;
}
export function useIntelligence(): IntelligenceValue { const ctx = useContext(IntelligenceContext); if (!ctx) throw new Error('useIntelligence must be used inside IntelligenceProvider'); return ctx; }
