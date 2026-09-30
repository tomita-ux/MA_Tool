import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env, Session } from './types';

// Identity comes from Cloudflare Access (Google login). The Access JWT is verified here —
// never trust the email header alone. Roles are looked up in D1.

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export type Verifier = (request: Request, env: Env) => Promise<string | null>;

/** Returns the verified email of the caller, or null. */
export const verifyAccess: Verifier = async (request, env) => {
  // local development only: never honoured unless the request is to localhost and Access is not configured
  const host = new URL(request.url).hostname;
  if (env.DEV_AUTH_EMAIL && !env.ACCESS_AUD && (host === 'localhost' || host === '127.0.0.1')) return env.DEV_AUTH_EMAIL.toLowerCase();
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  const team = env.ACCESS_TEAM_DOMAIN.replace(/\/+$/, '');
  let jwks = jwksCache.get(team);
  if (!jwks) jwksCache.set(team, (jwks = createRemoteJWKSet(new URL(`${team}/cdn-cgi/access/certs`))));
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: team, audience: env.ACCESS_AUD });
    return typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
};

export async function resolveSession(email: string, env: Env): Promise<Session | null> {
  const bootstrap = (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (bootstrap.includes(email)) return { email, role: 'admin', workspaceIds: 'all' };
  const user = await env.DB.prepare('SELECT role FROM users WHERE email = ?').bind(email).first<{ role: string }>();
  if (!user) return null;
  if (user.role === 'admin') return { email, role: 'admin', workspaceIds: 'all' };
  const rows = await env.DB.prepare('SELECT workspace_id FROM user_workspaces WHERE email = ?').bind(email).all<{ workspace_id: string }>();
  return { email, role: 'viewer', workspaceIds: rows.results.map((r) => r.workspace_id) };
}

export const canRead = (s: Session, workspaceId: string) => s.workspaceIds === 'all' || s.workspaceIds.includes(workspaceId);
export const canWrite = (s: Session) => s.role === 'admin';
