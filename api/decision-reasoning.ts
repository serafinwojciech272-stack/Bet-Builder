import type { VercelRequest, VercelResponse } from '@vercel/node';

type ReasoningResponse = {
  stance?: unknown;
  synthesis?: unknown;
  factors?: unknown;
  uncertainties?: unknown;
};

const isString = (value: unknown): value is string => typeof value === 'string';

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

const SYSTEM = [
  'You are the evidence-aware reasoning layer of a governed Decision Platform.',
  'You do not approve, execute, place, or recommend a bet.',
  'You must never override deterministic hard gates, blockers, risk controls, or human approval.',
  'Reason only from the supplied evidence packet. Do not invent facts, sources, probabilities, events, or model outputs.',
  'Return strict JSON with stance, synthesis, factors, uncertainties.',
  'stance must be one of constructive, neutral, cautious, avoid.',
  'If status is BLOCKED, stance must be avoid and synthesis must preserve the blockers.',
].join(' ');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  const key = process.env.OPENROUTER_API_KEY?.trim();
  const model = process.env.OPENROUTER_MODEL?.trim();
  if (!key || !model) return res.status(503).json({ error: 'AI_PROVIDER_NOT_CONFIGURED', provider: 'openrouter' });

  const body = req.body as ReasoningRequest;
  if (!body?.decision || !body?.evidence) return res.status(400).json({ error: 'INVALID_REASONING_REQUEST' });

  const safePayload = JSON.stringify(body);
  if (safePayload.length > 24000) return res.status(413).json({ error: 'REASONING_CONTEXT_TOO_LARGE' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL ?? 'https://bet-builder-preview.vercel.app',
        'X-Title': process.env.OPENROUTER_APP_NAME ?? 'Bet Builder Decision Platform',
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 700,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `Evidence packet:\n${safePayload}` },
        ],
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    if (!upstream.ok) return res.status(502).json({ error: 'AI_PROVIDER_ERROR', provider: 'openrouter', status: upstream.status });
    const raw = await upstream.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = raw.choices?.[0]?.message?.content;
    if (!content) return res.status(502).json({ error: 'AI_EMPTY_RESPONSE', provider: 'openrouter' });

    let parsed: ReasoningResponse;
    try { parsed = JSON.parse(content); } catch { return res.status(502).json({ error: 'AI_INVALID_JSON', provider: 'openrouter' }); }
    const stance = ['constructive','neutral','cautious','avoid'].includes(parsed.stance) ? parsed.stance : 'neutral';
    const decisionStatus = body.decision.status;
    const guardedStance = decisionStatus === 'BLOCKED' ? 'avoid' : stance;
    const synthesis = typeof parsed.synthesis === 'string' ? parsed.synthesis.slice(0, 1200) : 'Provider returned no usable synthesis.';
    const factors = Array.isArray(parsed.factors) ? parsed.factors.filter(isString).slice(0,6) : [];
    const uncertainties = Array.isArray(parsed.uncertainties) ? parsed.uncertainties.filter(isString).slice(0,6) : [];
    return res.status(200).json({ provider:'openrouter', model, stance:guardedStance, synthesis, factors, uncertainties, degraded:false, evidenceDigest:body.evidence.digest });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error && error.name === 'AbortError' ? 'AI_PROVIDER_TIMEOUT' : 'AI_PROVIDER_UNAVAILABLE', provider:'openrouter' });
  } finally {
    clearTimeout(timer);
  }
}