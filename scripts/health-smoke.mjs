import { spawn } from 'node:child_process';

const port = 10001;
const child = spawn('npm', ['run', 'start'], {
  env: { ...process.env, PORT: String(port), PARLAY_API_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});

let output = '';
child.stdout.on('data', (chunk) => { output += chunk.toString(); });
child.stderr.on('data', (chunk) => { output += chunk.toString(); });

const startedAt = Date.now();

try {
  let response;
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      response = await fetch(`http://127.0.0.1:${port}/health`);
      break;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  if (!response) throw lastError ?? new Error('Health endpoint did not start');
  if (!response.ok) throw new Error(`Health endpoint returned HTTP ${response.status}`);

  const body = await response.json();
  if (body?.ok !== true || body?.service !== 'bet-builder-api') {
    throw new Error(`Unexpected health payload: ${JSON.stringify(body)}`);
  }

  console.log(`Health smoke PASS in ${Date.now() - startedAt}ms`);
} finally {
  try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
}
