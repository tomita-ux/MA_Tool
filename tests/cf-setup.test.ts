import { execFile } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Runs scripts/cf-setup.mjs against an in-memory mock of the Cloudflare API.
const run = promisify(execFile);
const ACCOUNT = 'acc123';
const calls: { method: string; path: string; body?: unknown }[] = [];
const state = {
  d1: [] as { uuid: string; name: string }[],
  projects: [] as { name: string; subdomain: string; env?: unknown }[],
  idps: [{ id: 'idp-existing', type: 'google', name: 'Google' }] as { id: string; type: string; name: string }[],
  apps: [{ id: 'other', domain: 'company-atlas.example.com', aud: 'x' }] as { id: string; domain: string; aud: string; allowed_idps?: string[] }[],
  policies: {} as Record<string, { id: string; name: string; include: unknown[] }[]>,
};
let server: Server;
let base = '';

const ok = (result: unknown) => JSON.stringify({ success: true, errors: [], result });
const fail = (code: number, message: string) => JSON.stringify({ success: false, errors: [{ code, message }] });

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : undefined;
      const path = (req.url ?? '').replace(`/accounts/${ACCOUNT}`, '').split('?')[0];
      calls.push({ method: req.method!, path, body });
      if (req.headers.authorization !== 'Bearer tok') return res.end(fail(10000, 'auth'));
      const m = req.method;
      let out: string;
      if (path === '/d1/database' && m === 'GET') out = ok(state.d1);
      else if (path === '/d1/database' && m === 'POST') state.d1.push({ uuid: 'db-uuid-1', name: body.name }), (out = ok(state.d1[0]));
      else if (path === '/pages/projects/ma-compass' && m === 'GET') {
        const p = state.projects.find((x) => x.name === 'ma-compass');
        out = p ? ok(p) : fail(8000007, 'not found');
      } else if (path === '/pages/projects' && m === 'POST') state.projects.push({ name: body.name, subdomain: 'ma-compass-abc.pages.dev' }), (out = ok(state.projects[0]));
      else if (path === '/pages/projects/ma-compass' && m === 'PATCH') (state.projects[0].env = body), (out = ok(state.projects[0]));
      else if (path === '/access/organizations') out = ok({ auth_domain: 'kazu1177.cloudflareaccess.com' });
      else if (path === '/access/identity_providers' && m === 'GET') out = ok(state.idps);
      else if (path === '/access/apps' && m === 'GET') out = ok(state.apps);
      else if (path === '/access/apps' && m === 'POST') state.apps.push({ id: 'app-1', aud: 'aud-123', ...body }), (out = ok(state.apps.at(-1)));
      else if (/^\/access\/apps\/[^/]+$/.test(path) && m === 'PUT') {
        const a = state.apps.find((x) => x.id === path.split('/')[3])!;
        Object.assign(a, body);
        out = ok(a);
      } else if (/\/policies$/.test(path) && m === 'GET') out = ok(state.policies[path.split('/')[3]] ?? []);
      else if (/\/policies$/.test(path) && m === 'POST') {
        const id = path.split('/')[3];
        (state.policies[id] ??= []).push({ id: 'pol-1', ...body });
        out = ok(state.policies[id][0]);
      } else if (/\/policies\/[^/]+$/.test(path) && m === 'PUT') {
        const id = path.split('/')[3];
        state.policies[id][0] = { id: 'pol-1', ...body };
        out = ok(state.policies[id][0]);
      } else out = fail(7003, `unexpected ${m} ${path}`);
      res.end(out);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address() as { port: number };
  base = `http://127.0.0.1:${addr.port}`;
});
afterAll(() => server.close());

const exec = (toml: string, extra: Record<string, string> = {}) =>
  run('node', ['scripts/cf-setup.mjs'], {
    env: { ...process.env, CF_API_BASE: base, CLOUDFLARE_API_TOKEN: 'tok', CLOUDFLARE_ACCOUNT_ID: ACCOUNT, ADMIN_EMAILS: 'owner@example.com', ALLOWED_EMAILS: 'viewer@client.example', WRANGLER_TOML: toml, ...extra },
  });

describe('scripts/cf-setup.mjs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cfsetup-'));
  const toml = join(dir, 'wrangler.toml');
  copyFileSync('wrangler.toml', toml);

  it('creates D1, Pages, the Access app with the existing Google login, policy and secrets', async () => {
    const { stdout } = await exec(toml);
    expect(stdout).toContain('完了');
    expect(readFileSync(toml, 'utf8')).toContain('database_id = "db-uuid-1"');
    const app = state.apps.find((a) => a.id === 'app-1')!;
    expect(app.domain).toBe('ma-compass-abc.pages.dev');
    expect(app.allowed_idps).toEqual(['idp-existing']);
    expect(state.apps.find((a) => a.id === 'other')!.domain).toBe('company-atlas.example.com'); // untouched
    expect(state.policies['app-1'][0].include).toEqual([{ email: { email: 'owner@example.com' } }, { email: { email: 'viewer@client.example' } }]);
    const env = state.projects[0].env as { deployment_configs: { production: { env_vars: Record<string, { type: string; value: string }> } } };
    expect(env.deployment_configs.production.env_vars.ACCESS_AUD).toEqual({ type: 'secret_text', value: 'aud-123' });
    expect(env.deployment_configs.production.env_vars.ACCESS_TEAM_DOMAIN.value).toBe('https://kazu1177.cloudflareaccess.com');
  });

  it('is safe to run again (updates instead of duplicating)', async () => {
    await exec(toml);
    expect(state.d1).toHaveLength(1);
    expect(state.projects).toHaveLength(1);
    expect(state.apps.filter((a) => a.domain === 'ma-compass-abc.pages.dev')).toHaveLength(1);
    expect(state.policies['app-1']).toHaveLength(1);
  });

  it('stops with a readable message when required variables are missing', async () => {
    await expect(run('node', ['scripts/cf-setup.mjs'], { env: { ...process.env, CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_ACCOUNT_ID: '' } })).rejects.toMatchObject({ stderr: expect.stringContaining('CLOUDFLARE_API_TOKEN') });
  });
});
