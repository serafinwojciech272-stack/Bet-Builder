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

  const providers = {
    sportsgameodds: Boolean(process.env.SPORTSODDS_API_KEY?.trim() || process.env.SPORTSGAMEODDS_API_KEY?.trim()),
    parlayApi: Boolean(process.env.PARLAY_API_KEY?.trim()),
    theOddsApi: Boolean(process.env.ODDS_API_KEY?.trim()),
  };
  const provider = providers.sportsgameodds
    ? 'sportsgameodds'
    : providers.parlayApi
      ? 'parlay-api'
      : providers.theOddsApi
        ? 'the-odds-api'
        : 'parlay-api-preview';
  const providerConfigured = providers.sportsgameodds || providers.parlayApi || providers.theOddsApi;

  res.status(200).end(JSON.stringify({
    ok: true,
    service: 'bet-builder-api',
    provider,
    providerConfigured,
    providers,
    research: true,
    now: new Date().toISOString(),
  }));
}
