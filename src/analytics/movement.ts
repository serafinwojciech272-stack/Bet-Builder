export interface MovementPoint { selectionId: string; bookmaker: string; odds: number; capturedAt: string; }
export interface MovementSummary { selectionId: string; bookmaker: string; openingOdds: number; currentOdds: number; minOdds: number; maxOdds: number; changePct: number; direction: 'UP' | 'DOWN' | 'STABLE'; velocityPerHour: number; observations: number; }
export interface SteamSignal { selectionId: string; bookmakerCount: number; downCount: number; upCount: number; consensusChangePct: number; strength: number; direction: 'STEAM_DOWN' | 'STEAM_UP' | 'NO_STEAM'; }

export function summarizeMovement(points: MovementPoint[], tolerancePct = 0.5): MovementSummary[] {
  const groups = new Map<string, MovementPoint[]>();
  for (const p of points) { if (!Number.isFinite(p.odds) || p.odds <= 1) continue; const key = `${p.selectionId}:${p.bookmaker}`; groups.set(key, [...(groups.get(key) ?? []), p]); }
  return [...groups.values()].map((series) => { const ordered = [...series].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)); const openingOdds = ordered[0].odds; const currentOdds = ordered.at(-1)?.odds ?? openingOdds; const minOdds = Math.min(...ordered.map((p) => p.odds)); const maxOdds = Math.max(...ordered.map((p) => p.odds)); const changePct = ((currentOdds - openingOdds) / openingOdds) * 100; const hours = Math.max((new Date(ordered.at(-1)?.capturedAt ?? ordered[0].capturedAt).getTime() - new Date(ordered[0].capturedAt).getTime()) / 3600000, 1 / 60); const direction = changePct > tolerancePct ? 'UP' : changePct < -tolerancePct ? 'DOWN' : 'STABLE'; return { selectionId: ordered[0].selectionId, bookmaker: ordered[0].bookmaker, openingOdds, currentOdds, minOdds, maxOdds, changePct, direction, velocityPerHour: changePct / hours, observations: ordered.length }; });
}

export function detectSteam(points: MovementPoint[], thresholdPct = 1): SteamSignal[] {
  const bySelection = new Map<string, MovementSummary[]>();
  for (const s of summarizeMovement(points)) bySelection.set(s.selectionId, [...(bySelection.get(s.selectionId) ?? []), s]);
  return [...bySelection.entries()].map(([selectionId, summaries]) => { const downCount = summaries.filter((s) => s.changePct <= -thresholdPct).length; const upCount = summaries.filter((s) => s.changePct >= thresholdPct).length; const consensusChangePct = summaries.reduce((sum, s) => sum + s.changePct, 0) / Math.max(1, summaries.length); const strength = Math.min(1, Math.abs(consensusChangePct) / Math.max(thresholdPct, 0.01) * (Math.max(downCount, upCount) / Math.max(1, summaries.length))); const direction = downCount > upCount && consensusChangePct <= -thresholdPct ? 'STEAM_DOWN' : upCount > downCount && consensusChangePct >= thresholdPct ? 'STEAM_UP' : 'NO_STEAM'; return { selectionId, bookmakerCount: summaries.length, downCount, upCount, consensusChangePct, strength, direction }; });
}
