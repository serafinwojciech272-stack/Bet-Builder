import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

type AdapterRequest = { method?: string; query: Record<string, string>; headers?: Record<string, string | undefined>; body?: unknown };
type AdapterResponse = {
  status: (code: number) => AdapterResponse;
  setHeader: (name: string, value: string) => AdapterResponse;
  end: (body: string) => void;
  json: (body: unknown) => void;
};
type Handler = (req: AdapterRequest, res: AdapterResponse) => Promise<unknown> | unknown;

async function adapt(handler: Handler, req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const query: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) query[key] = value;
  let body: unknown;
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > 1024 * 1024) throw new Error('REQUEST_BODY_TOO_LARGE');
      chunks.push(buffer);
    }
    const raw = Buffer.concat(chunks).toString('utf8');
    if (raw) {
      body = String(req.headers['content-type'] ?? '').includes('application/json') ? JSON.parse(raw) : raw;
    }
  }
  const request = { method: req.method ?? 'GET', query, body, headers: { origin: req.headers.origin, authorization: req.headers.authorization, 'x-core-engine-e2e-token': req.headers['x-core-engine-e2e-token'] } };
  const response = {
    status(code: number) { res.statusCode = code; return response; },
    setHeader(name: string, value: string) { res.setHeader(name, value); return response; },
    end(body: string) { res.end(body); },
    json(body: unknown) { res.setHeader('Content-Type','application/json; charset=utf-8'); res.end(JSON.stringify(body)); },
  };
  return handler(request, response);
}

const oddsModule = await import('./api/odds.ts');
const researchModule = await import('./api/research.ts');
const coreEngineE2EModule = await import('./api/core-engine-persistence-e2e.ts');
const healthModule = await import('./api/health.ts');
const decisionReasoningModule = await import('./api/decision-reasoning.ts');
const coreEngineModule = await import('./api/core-engine.ts');
const oddsHandler = oddsModule.default as Handler;
const researchHandler = researchModule.default as Handler;
const coreEngineE2EHandler = coreEngineE2EModule.default as Handler;
const healthHandler = healthModule.default as Handler;
const decisionReasoningHandler = decisionReasoningModule.default as Handler;
const coreEngineHandler = coreEngineModule.default as Handler;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const origin = req.headers.origin;
  const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS ?? 'https://bet-builder-preview.vercel.app,https://bet-builder-live.onrender.com').split(',').map((value) => value.trim()).filter(Boolean));
  if (origin && allowedOrigins.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Core-Engine-E2E-Token');
  if (req.method === 'OPTIONS') { res.statusCode = origin && !allowedOrigins.has(origin) ? 403 : 204; res.end(); return; }

  try {
    if (url.pathname === '/api/odds') return await adapt(oddsHandler, req, res);
    if (url.pathname === '/api/research') return await adapt(researchHandler, req, res);
    if (url.pathname === '/api/core-engine-persistence-e2e') return await adapt(coreEngineE2EHandler, req, res);
    if (url.pathname === '/health') return await adapt(healthHandler, req, res);
    if (url.pathname === '/api/core-engine') return await adapt(coreEngineHandler, req, res);
    if (url.pathname === '/api/decision-reasoning') return await adapt(decisionReasoningHandler, req, res);
    res.statusCode = 404;
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.end(JSON.stringify({ error:'NOT_FOUND' }));
  } catch {
    res.statusCode = 500;
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.end(JSON.stringify({ error:'INTERNAL_SERVER_ERROR' }));
  }
});

const port = Number(process.env.PORT ?? 10000);
server.listen(port, '0.0.0.0', () => console.log(`Bet Builder API listening on ${port}`));
