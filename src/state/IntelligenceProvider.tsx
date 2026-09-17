import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { CanonicalDataset } from '../domain/repositories';
import type { MarketKey } from '../domain/types';
import type { AnalysisRecord } from '../ai/AnalysisRepository';
import type { AnalysisResponse, RecommendedAction } from '../ai/contracts';
import { AnalysisError } from '../ai/AIAnalysisService';
import type { Mission } from '../missions/types';
import { buildMissionFromAnalysis, type MissionDraftOptions } from '../missions/missionFactory';
import { MissionTransitionError } from '../missions/stateMachine';
import { createWorkspace, type Workspace } from './services';
import { seedWorkspace } from './seed';

export type LoadPhase = 'idle' | 'loading' | 'ready' | 'error';

export interface Toast {
  id: string;
  tone: 'success' | 'error' | 'info';
  title: string;
  detail?: string;
}

export interface AnalysisJobState {
  status: 'idle' | 'loading' | 'error';
  error?: string;
  retryable?: boolean;
}

export interface EngineStatus {
  aiEngineId: string;
  aiOnline: boolean;
  aiDetail: string;
  coreEngineId: string;
  coreVersion: string;
  monetaryExecution: boolean;
}

interface IntelligenceValue {
  phase: LoadPhase;
  error: string | null;
  dataset: CanonicalDataset | null;
  analyses: AnalysisRecord[];
  missions: Mission[];
  engine: EngineStatus | null;
  analysisJobs: Record<string, AnalysisJobState>;
  busyMissionIds: string[];
  toasts: Toast[];
  lastRefreshedAt: string | null;
  nowTick: number;
  operator: string;
  refresh: () => Promise<void>;
  runAnalysis: (
    eventId: string,
    options?: { market?: MarketKey; depth?: 'standard' | 'deep' },
  ) => Promise<AnalysisResponse | null>;
  createMission: (
    analysis: AnalysisResponse,
    action: RecommendedAction,
    options?: MissionDraftOptions,
  ) => Promise<Mission | null>;
  toggleCheck: (missionId: string, checkId: string) => Promise<void>;
  requestApproval: (missionId: string) => Promise<void>;
  approveMission: (missionId: string, note: string) => Promise<void>;
  rejectMission: (missionId: string, note: string) => Promise<void>;
  cancelMission: (missionId: string, reason: string) => Promise<void>;
  executeMission: (missionId: string) => Promise<void>;
  simulateEngineFailure: () => void;
  dismissToast: (id: string) => void;
}

const IntelligenceContext = createContext<IntelligenceValue | null>(null);

export function IntelligenceProvider({ children }: { children: ReactNode }) {
  const workspaceRef = useRef<Workspace | null>(null);
  if (!workspaceRef.current) workspaceRef.current = createWorkspace();
  const workspace = workspaceRef.current;

  const [phase, setPhase] = useState<LoadPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [dataset, setDataset] = useState<CanonicalDataset | null>(null);
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [analysisJobs, setAnalysisJobs] = useState<Record<string, AnalysisJobState>>({});
  const [busyMissionIds, setBusyMissionIds] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const seedPromiseRef = useRef<Promise<unknown> | null>(null);

  const operator = 'j.moreau';

  const pushToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const syncStores = useCallback(async () => {
    const [nextAnalyses, nextMissions] = await Promise.all([
      workspace.analysisRepository.list(),
      workspace.missionRepository.list(),
    ]);
    setAnalyses(nextAnalyses);
    setMissions(nextMissions);
  }, [workspace]);

  const refresh = useCallback(async () => {
    setPhase('loading');
    setError(null);
    try {
      const data = await workspace.dataRepository.loadCanonicalDataset();
      setDataset(data);
      const [health, caps] = await Promise.all([
        workspace.analysisService.health(),
        workspace.coreEngine.capabilities(),
      ]);
      setEngine({
        aiEngineId: health.engineId,
        aiOnline: health.ok,
        aiDetail: health.detail,
        coreEngineId: caps.engineId,
        coreVersion: caps.version,
        monetaryExecution: caps.supportsMonetaryExecution,
      });
      // Seed exactly once, but always await the in-flight seed so a second
      // bootstrap (e.g. React StrictMode double-invoke) still sees the data.
      if (!seedPromiseRef.current) {
        seedPromiseRef.current = seedWorkspace(workspace);
      }
      await seedPromiseRef.current;
      await syncStores();
      setLastRefreshedAt(new Date().toISOString());
      setPhase('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown bootstrap failure');
      setPhase('error');
    }
  }, [workspace, syncStores]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const runAnalysis = useCallback<IntelligenceValue['runAnalysis']>(
    async (eventId, options) => {
      setAnalysisJobs((prev) => ({ ...prev, [eventId]: { status: 'loading' } }));
      try {
        const analysis = await workspace.analysisService.analyzeEvent({
          eventId,
          market: options?.market,
          depth: options?.depth ?? 'standard',
          requestedBy: operator,
        });
        await workspace.analysisRepository.save(analysis);
        await syncStores();
        setAnalysisJobs((prev) => ({ ...prev, [eventId]: { status: 'idle' } }));
        pushToast({
          tone: 'success',
          title: 'Analysis complete',
          detail: `${analysis.context.eventLabel} · confidence ${(analysis.confidence.score.value * 100).toFixed(0)}%`,
        });
        return analysis;
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Analysis failed';
        const retryable = e instanceof AnalysisError ? e.retryable : true;
        setAnalysisJobs((prev) => ({
          ...prev,
          [eventId]: { status: 'error', error: message, retryable },
        }));
        pushToast({ tone: 'error', title: 'Analysis failed', detail: message });
        return null;
      }
    },
    [workspace, syncStores, pushToast],
  );

  const withMissionBusy = useCallback(
    async (missionId: string, fn: () => Promise<void>) => {
      setBusyMissionIds((prev) => [...prev, missionId]);
      try {
        await fn();
      } catch (e) {
        const message =
          e instanceof MissionTransitionError
            ? `${e.code}: ${e.message}`
            : e instanceof Error
              ? e.message
              : 'Mission operation failed';
        pushToast({ tone: 'error', title: 'Mission blocked', detail: message });
      } finally {
        setBusyMissionIds((prev) => prev.filter((id) => id !== missionId));
        await syncStores();
      }
    },
    [pushToast, syncStores],
  );

  const createMission = useCallback<IntelligenceValue['createMission']>(
    async (analysis, action, options) => {
      try {
        const mission = buildMissionFromAnalysis(analysis, action, {
          createdBy: operator,
          ...options,
        });
        await workspace.missionService.saveDraft(mission);
        await syncStores();
        pushToast({
          tone: 'success',
          title: 'Mission drafted',
          detail: `${mission.id} created in DRAFT — approval required before execution.`,
        });
        return mission;
      } catch (e) {
        pushToast({
          tone: 'error',
          title: 'Could not draft mission',
          detail: e instanceof Error ? e.message : 'Unknown error',
        });
        return null;
      }
    },
    [workspace, syncStores, pushToast],
  );

  const toggleCheck = useCallback<IntelligenceValue['toggleCheck']>(
    async (missionId, checkId) => {
      await withMissionBusy(missionId, async () => {
        await workspace.missionService.toggleChecklistItem(missionId, checkId, operator);
      });
    },
    [workspace, withMissionBusy],
  );

  const requestApproval = useCallback<IntelligenceValue['requestApproval']>(
    async (missionId) => {
      await withMissionBusy(missionId, async () => {
        await workspace.missionService.requestApproval(missionId, operator);
        pushToast({ tone: 'info', title: 'Sent to approval gate', detail: missionId });
      });
    },
    [workspace, withMissionBusy, pushToast],
  );

  const approveMission = useCallback<IntelligenceValue['approveMission']>(
    async (missionId, note) => {
      await withMissionBusy(missionId, async () => {
        await workspace.missionService.approve(missionId, operator, note);
        pushToast({ tone: 'success', title: 'Mission approved', detail: `${missionId} may now execute.` });
      });
    },
    [workspace, withMissionBusy, pushToast],
  );

  const rejectMission = useCallback<IntelligenceValue['rejectMission']>(
    async (missionId, note) => {
      await withMissionBusy(missionId, async () => {
        await workspace.missionService.reject(missionId, operator, note);
        pushToast({ tone: 'info', title: 'Mission rejected', detail: `${missionId} cancelled at the gate.` });
      });
    },
    [workspace, withMissionBusy, pushToast],
  );

  const cancelMission = useCallback<IntelligenceValue['cancelMission']>(
    async (missionId, reason) => {
      await withMissionBusy(missionId, async () => {
        await workspace.missionService.cancel(missionId, operator, reason);
        pushToast({ tone: 'info', title: 'Mission cancelled', detail: missionId });
      });
    },
    [workspace, withMissionBusy, pushToast],
  );

  const executeMission = useCallback<IntelligenceValue['executeMission']>(
    async (missionId) => {
      await withMissionBusy(missionId, async () => {
        const result = await workspace.missionService.execute(missionId, operator);
        pushToast({
          tone: result.status === 'COMPLETED' ? 'success' : 'error',
          title: result.status === 'COMPLETED' ? 'Mission completed' : 'Mission failed',
          detail: result.measurement
            ? `Verdict ${result.measurement.verdict} · CLV ${result.measurement.closingLineValuePct.formatted}`
            : result.execution?.failureReason ?? undefined,
        });
      });
    },
    [workspace, withMissionBusy, pushToast],
  );

  const simulateEngineFailure = useCallback(() => {
    workspace.setFailNextAnalysis(true);
    pushToast({
      tone: 'info',
      title: 'Fault injected',
      detail: 'The next analysis request will fail so you can exercise the retry path.',
    });
  }, [workspace, pushToast]);

  const value = useMemo<IntelligenceValue>(
    () => ({
      phase,
      error,
      dataset,
      analyses,
      missions,
      engine,
      analysisJobs,
      busyMissionIds,
      toasts,
      lastRefreshedAt,
      nowTick,
      operator,
      refresh,
      runAnalysis,
      createMission,
      toggleCheck,
      requestApproval,
      approveMission,
      rejectMission,
      cancelMission,
      executeMission,
      simulateEngineFailure,
      dismissToast,
    }),
    [
      phase,
      error,
      dataset,
      analyses,
      missions,
      engine,
      analysisJobs,
      busyMissionIds,
      toasts,
      lastRefreshedAt,
      nowTick,
      refresh,
      runAnalysis,
      createMission,
      toggleCheck,
      requestApproval,
      approveMission,
      rejectMission,
      cancelMission,
      executeMission,
      simulateEngineFailure,
      dismissToast,
    ],
  );

  return <IntelligenceContext.Provider value={value}>{children}</IntelligenceContext.Provider>;
}

export function useIntelligence(): IntelligenceValue {
  const ctx = useContext(IntelligenceContext);
  if (!ctx) throw new Error('useIntelligence must be used inside IntelligenceProvider');
  return ctx;
}
