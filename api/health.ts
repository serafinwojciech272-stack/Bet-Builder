type HealthRequest = { method?: string };
type HealthResponse = {
  status: (code: number) => HealthResponse;
  setHeader: (name: string, value: string) => HealthResponse;
  end: (body: string) => void;
};

export default async function handler(_req: HealthRequest, res: HealthResponse) {
  // Keep /health shallow and deterministic. Render polls this endpoint to decide
  // whether the process can receive traffic; external provider calls belong to
  // the provider/odds smoke path, not the liveness probe.
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const providerConfigured = Boolean(process.env.PARLAY_API_KEY?.trim());

  res.status(200).end(JSON.stringify({
    ok: true,
    service: 'bet-builder-api',
    provider: 'parlay-api',
    providerConfigured,
    research: true,
    now: new Date().toISOString(),
  }));
}
