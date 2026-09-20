import { timingSafeEqual } from 'node:crypto';

type SupabaseIdentity = {
  id: string;
  email?: string | null;
};

function constantTimeEqual(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function bearerToken(req: { headers?: Record<string, string | string[] | undefined> }): string {
  const raw = req.headers?.authorization ?? req.headers?.Authorization ?? '';
  const value = Array.isArray(raw) ? raw[0] ?? '' : raw;
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : '';
}

export async function authenticateSupabaseUser(
  req: { headers?: Record<string, string | string[] | undefined> },
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<SupabaseIdentity | null> {
  const token = bearerToken(req);
  if (!token) return null;

  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) return null;
  const body = await response.json() as { id?: string; email?: string | null };
  return body.id ? { id: body.id, email: body.email ?? null } : null;
}

export function authorizedByInternalToken(
  req: { headers?: Record<string, string | string[] | undefined> },
  expected: string,
): boolean {
  if (!expected) return false;
  const raw = req.headers?.['x-core-engine-e2e-token'] ?? req.headers?.['X-Core-Engine-E2E-Token'] ?? '';
  const supplied = Array.isArray(raw) ? raw[0] ?? '' : raw;
  return constantTimeEqual(supplied.trim(), expected);
}
