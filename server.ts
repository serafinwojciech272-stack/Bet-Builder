import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

type Handler = (req: any, res: any) => Promise<unknown> | unknown;

function adapt(handler: Handler, req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const query: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) query[key] = value;
  const request = { method: req.method ?? 'GET', query };
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
const oddsHandler = oddsModule.default as Handler;
const researchHandler = researchModule.default as Handler;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

  try {
    if (url.pathname === '/api/odds') return await adapt(oddsHandler, req, res);
    if (url.pathname === '/api/research') return await adapt(researchHandler, req, res);
    if (url.pathname === '/health') {
      res.setHeader('Content-Type','application/json; charset=utf-8');
      res.end(JSON.stringify({ ok:true, service:'bet-builder-api', provider:'parlay-api', research:true, now:new Date().toISOString() }));
      return;
    }
    res.statusCode = 404;
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.end(JSON.stringify({ error:'NOT_FOUND' }));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.end(JSON.stringify({ error:'INTERNAL_SERVER_ERROR', message:error instanceof Error ? error.message : 'Unknown error' }));
  }
});

const port = Number(process.env.PORT ?? 10000);
server.listen(port, '0.0.0.0', () => console.log(`Bet Builder API listening on ${port}`));
