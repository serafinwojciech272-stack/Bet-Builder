import { spawn } from 'node:child_process';

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CORE_ENGINE_E2E_TOKEN'];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  console.error(`PERSISTENCE_E2E_MISSING_ENV:${missing.join(',')}`);
  process.exit(2);
}

const port = process.env.PERSISTENCE_E2E_PORT ?? '10001';
const baseUrl = `http://127.0.0.1:${port}`;

const child = spawn('npm', ['run', 'start'], {
  env: { ...process.env, PORT: port, ALLOWED_ORIGINS: 'http://127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
child.stdout.on('data', (chunk) => { output += chunk.toString(); });
child.stderr.on('data', (chunk) => { output += chunk.toString(); });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  let ready = false;
  for (let i = 0; i < 30; i += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await sleep(500);
  }

  if (!ready) throw new Error(`LOCAL_SERVER_NOT_READY:${output.slice(-2000)}`);

  const response = await fetch(`${baseUrl}/api/core-engine-persistence-e2e`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Core-Engine-E2E-Token': process.env.CORE_ENGINE_E2E_TOKEN,
    },
    body: '{}',
  });

  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); } catch { body = { raw }; }

  console.log(JSON.stringify({
    httpStatus: response.status,
    status: body?.status ?? null,
    e2e: body?.e2e ?? null,
    error: body?.error ?? null,
    checks: body?.checks ?? null,
  }, null, 2));

  if (!response.ok || body?.status !== 'PASS') {
    if (body?.error) console.error(`PERSISTENCE_E2E_ERROR:${body.error}`);
    console.error('PERSISTENCE_E2E_FAILED');
    process.exit(1);
  }

  const checks = body.checks ?? {};
  const requiredChecks = [
    'runPersisted',
    'ledgerPersisted',
    'auditPersisted',
    'lifecycleComplete',
    'restartRecovery',
    'persistedAuditChainValid',
    'returnedAuditChainValid',
    'idempotency',
    'observationalOnly',
    'deterministicIdsStable',
  ];
  const failed = requiredChecks.filter((key) => checks[key] !== true);
  if (failed.length) {
    console.error(`PERSISTENCE_E2E_FAILED_CHECKS:${failed.join(',')}`);
    process.exit(1);
  }

  console.log('PERSISTENCE_E2E_PASS');
} finally {
  child.kill('SIGTERM');
}
