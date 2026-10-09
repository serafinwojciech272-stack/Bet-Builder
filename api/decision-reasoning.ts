import type { VercelRequest, VercelResponse } from '../src/server/vercelTypes.js';
import { rejectIfRateLimited } from './_rateLimit.js';

type ReasoningRequest = {
  decision: {
    status: 'READY'|'CAUTION'|'BLOCKED';
    ev: number;
    confidence: number;
    quality: number;
    blockers: string[];
    warnings: string[];
    strengths: string[];
    trace: string[];
  };
  evidence: {
    digest: string;
    coverage: number;
    conflicts: number;
    nodes: Array<{id:string;kind:string;label:string;value?:number;confidence?:number}>;
  };
  task?: 'reason';
};

const DEFAULT_CORE_ENGINE_URL = 'https://core-engine-34uu.onrender.com';

function json(res: VercelResponse, status: number, body: unknown) {
  return res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').setHeader('Cache-Control', 'no-store').json(body);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').slice(0, 6)
    : [];
}

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  if (rejectIfRateLimited('decision-reasoning', req, res, 10)) return;

  const body = req.body as ReasoningRequest;
  if (!body?.decision || !body?.evidence) return json(res, 400, { error: 'INVALID_REASONING_REQUEST' });

  const safePayload = JSON.stringify(body);
  if (safePayload.length > 24000) return json(res, 413, { error: 'REASONING_CONTEXT_TOO_LARGE' });

  const base = (process.env.CORE_ENGINE_URL || DEFAULT_CORE_ENGINE_URL).replace(/\/$/, '');
  const key = process.env.CORE_ENGINE_API_KEY?.trim();
  if (!key) return json(res, 503, { error: 'CORE_ENGINE_NOT_CONFIGURED', provider: 'core-engine' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const task = [
      'Act as the governed sports-decision reasoning layer for Bet Builder.',
      'Return a concise evidence-grounded synthesis of the supplied decision packet.',
      'Do not approve, place, execute or recommend a bet. Do not override blockers or deterministic gates.',
      'Separate evidence from interpretation. If status is BLOCKED, preserve the blockers and use an avoid stance.',
      'Return JSON when possible with keys: stance, synthesis, factors, uncertainties.',
      'Evidence packet:',
      safePayload
    ].join('\n');

    const upstream = await fetch(base + '/api/integrations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-core-engine-client': 'bet-builder',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        task,
        project: 'bet-builder',
        domain: 'sports-analysis',
        capabilities: ['reasoning', 'risk-analysis', 'verification'],
        approvalPolicy: 'HUMAN_APPROVAL_REQUIRED',
        context: safePayload,
      }),
      signal: controller.signal,
      cache: 'no-store',
    });

    const raw = await upstream.text();
    if (!upstream.ok) return json(res, 502, { error: 'CORE_ENGINE_ERROR', status: upstream.status });

    let upstreamPayload: unknown;
    try {
      upstreamPayload = raw ? JSON.parse(raw) : {};
    } catch {
      return json(res, 502, { error: 'CORE_ENGINE_INVALID_RESPONSE', provider: 'core-engine' });
    }

    const payload = safeRecord(upstreamPayload);
    const reply = typeof payload.reply === 'string' ? payload.reply.trim() : '';
    if (!reply) return json(res, 502, { error: 'CORE_ENGINE_EMPTY_RESPONSE', provider: 'core-engine' });

    let parsed: Record<string, unknown> = {};
    try {
      parsed = safeRecord(JSON.parse(reply));
    } catch {
      // Free-text reply: keep `parsed` empty and fall back to the raw synthesis below.
    }

    const status = body.decision.status;
    const requestedStance = String(parsed.stance || '').toLowerCase();
    const stance = status === 'BLOCKED'
      ? 'avoid'
      : ['constructive', 'neutral', 'cautious', 'avoid'].includes(requestedStance)
        ? requestedStance
        : status === 'CAUTION' ? 'cautious' : 'neutral';

    const synthesis = typeof parsed.synthesis === 'string'
      ? parsed.synthesis.slice(0, 1600)
      : reply.slice(0, 1600);

    const parsedFactors = stringArray(parsed.factors);
    const parsedUncertainties = stringArray(parsed.uncertainties);
    const factors = parsedFactors.length
      ? parsedFactors
      : [...body.decision.strengths.slice(0, 3), ...body.decision.warnings.slice(0, 3)].slice(0, 6);

    const uncertainties = parsedUncertainties.length
      ? parsedUncertainties
      : [...body.decision.blockers.slice(0, 3), 'Evidence coverage: ' + Math.round(body.evidence.coverage * 100) + '%', 'Evidence conflicts: ' + body.evidence.conflicts].slice(0, 6);

    const intelligence = safeRecord(payload.intelligence);
    const selectedModels = Array.isArray(intelligence.selectedModels) ? intelligence.selectedModels : [];
    return json(res, 200, {
      provider: 'core-engine',
      model: typeof selectedModels[0] === 'string' ? selectedModels[0] : 'core-engine-routed',
      stance,
      synthesis,
      factors,
      uncertainties,
      degraded: false,
      evidenceDigest: body.evidence.digest,
      centralRouting: true,
      project: 'bet-builder',
    });
  } catch (error) {
    return json(res, 502, {
      error: error instanceof Error && error.name === 'AbortError' ? 'CORE_ENGINE_TIMEOUT' : 'CORE_ENGINE_UNAVAILABLE',
      provider: 'core-engine',
    });
  } finally {
    clearTimeout(timer);
  }
}
