import { spawn } from 'node:child_process';

const port = 10002;
const child = spawn('npm', ['run', 'start'], {
  env: { ...process.env, PORT: String(port), PARLAY_API_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});

let output = '';
child.stdout.on('data', (chunk) => { output += chunk.toString(); });
child.stderr.on('data', (chunk) => { output += chunk.toString(); });

async function get(path) {
  let response;
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      response = await fetch(`http://127.0.0.1:${port}${path}`);
      break;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  if (!response) throw lastError ?? new Error(`Request did not start: ${path}`);
  return response;
}

try {
  const health = await get('/health');
  if (!health.ok) throw new Error(`health HTTP ${health.status}`);

  const odds = await get('/api/odds');
  const oddsBody = await odds.json();
  if (odds.status !== 503 || oddsBody?.error !== 'ODDS_PROVIDER_NOT_CONFIGURED') {
    throw new Error(`unexpected odds contract: HTTP ${odds.status} ${JSON.stringify(oddsBody)}`);
  }

  const research = await get('/api/research');
  const researchBody = await research.json();
  if (research.status !== 400 || researchBody?.error !== 'home_and_away_required') {
    throw new Error(`unexpected research contract: HTTP ${research.status} ${JSON.stringify(researchBody)}`);
  }

  console.log('API contract smoke PASS');
} finally {
  try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
  if (output.includes('EADDRINUSE')) process.stderr.write(output);
}
