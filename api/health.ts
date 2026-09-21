type HealthRequest = { method?: string };
type HealthResponse = {
  status: (code: number) => HealthResponse;
  setHeader: (name: string, value: string) => HealthResponse;
  end: (body: string) => void;
};

export default async function handler(_req: HealthRequest, res: HealthResponse) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const apiKey = process.env.PARLAY_API_KEY?.trim();
  let providerHealth: Record<string, unknown> = { configured: false, status: 'NOT_CONFIGURED' };
  if (apiKey) {
    const started = Date.now();
    try {
      const response = await fetch('https://parlay-api.com/v1/sports/', {
        headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      let sportsCount: number | null = null;
      if (response.ok) {
        try {
          const body = await response.json();
          sportsCount = Array.isArray(body) ? body.length : null;
        } catch {
          providerHealth = { configured: true, status: 'INVALID_RESPONSE', httpStatus: response.status, latencyMs: Date.now() - started };
          res.end(JSON.stringify({ ok: true, service: 'bet-builder-api', provider: 'parlay-api', research: true, providerHealth, now: new Date().toISOString() }));
          return;
        }
      }
      providerHealth = {
        configured: true,
        status: response.ok ? 'AUTHENTICATED' : (response.status === 401 || response.status === 403 ? 'REJECTED' : 'UNREACHABLE'),
        httpStatus: response.status,
        latencyMs: Date.now() - started,
        sportsCount,
      };
    } catch (error) {
      providerHealth = {
        configured: true,
        status: error instanceof Error && error.name === 'TimeoutError' ? 'TIMEOUT' : 'UNREACHABLE',
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.name : 'REQUEST_FAILED',
      };
    }
  }
  res.end(JSON.stringify({ ok: true, service: 'bet-builder-api', provider: 'parlay-api', research: true, providerHealth, now: new Date().toISOString() }));
}
