import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleApi } from '../server/api';
import { brandTerms, decrypt, encrypt, gscToBridge, period, signState, termsRegex, verifyState } from '../server/google';
import type { Env } from '../server/types';
import { SAMPLE_WORKSPACES } from '@/core/data/workspaces';
import type { Workspace } from '@/core/types';
import { d1 } from './d1';

const KEY = Buffer.alloc(32, 7).toString('base64');
const OWNER = 'owner@example.com';
let env: Env;
let db: DatabaseSync;
const as = (email: string | null) => async () => email;
const call = (method: string, path: string, email: string | null, body?: unknown) =>
  handleApi(new Request(`https://app.example${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }), env, as(email));

const client = (google: Workspace['google']): Workspace => ({ ...structuredClone(SAMPLE_WORKSPACES[0]), id: 'acme', name: '株式会社アクメ', demo: false, google });

/** Routes Google endpoints to canned answers; records every request body. */
function mockGoogle(handlers: Record<string, (body: Record<string, unknown>) => { status?: number; json: unknown }>) {
  const seen: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
  vi.stubGlobal('fetch', async (input: string, init: RequestInit = {}) => {
    const url = String(input);
    const raw = typeof init.body === 'string' ? init.body : init.body instanceof URLSearchParams ? init.body.toString() : '';
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(raw);
    } catch {
      body = Object.fromEntries(new URLSearchParams(raw));
    }
    seen.push({ url, body, headers: (init.headers ?? {}) as Record<string, string> });
    const key = Object.keys(handlers).find((k) => url.includes(k));
    if (!key) return new Response('{"error":{"message":"unexpected"}}', { status: 500 });
    const r = handlers[key](body);
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200 });
  });
  return seen;
}

const idToken = (email: string) => `x.${Buffer.from(JSON.stringify({ email })).toString('base64url')}.y`;
const tokenEndpoint = { 'oauth2.googleapis.com/token': () => ({ json: { access_token: 'at', refresh_token: 'rt-secret', scope: 'a b', id_token: idToken('agency@gmail.com') } }) };

async function connect() {
  mockGoogle(tokenEndpoint);
  const start = await call('GET', '/api/google/connect', OWNER);
  const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
  return call('GET', `/api/google/callback?code=c1&state=${encodeURIComponent(state)}`, OWNER);
}

beforeEach(async () => {
  db = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').sort()) db.exec(readFileSync(`migrations/${f}`, 'utf8'));
  env = { DB: d1(db), ADMIN_EMAILS: OWNER, GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret', TOKEN_KEY: KEY };
});
afterEach(() => vi.unstubAllGlobals());

describe('stored token and OAuth state', () => {
  it('encrypts the refresh token and refuses another key', async () => {
    const sealed = await encrypt(env, 'rt-secret');
    expect(sealed).not.toContain('rt-secret');
    expect(await decrypt(env, sealed)).toBe('rt-secret');
    await expect(decrypt({ ...env, TOKEN_KEY: Buffer.alloc(32, 9).toString('base64') }, sealed)).rejects.toThrow(/連携し直して/);
  });

  it('accepts a state only from the same admin within 10 minutes', async () => {
    const now = Date.now();
    const state = await signState(env, OWNER, now);
    expect(await verifyState(env, state, OWNER, now + 60_000)).toBe(true);
    expect(await verifyState(env, state, 'other@example.com', now)).toBe(false);
    expect(await verifyState(env, state, OWNER, now + 11 * 60_000)).toBe(false);
    expect(await verifyState(env, state.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')), OWNER, now)).toBe(false);
  });
});

describe('Search Console grouping', () => {
  it('derives brand words from the site and the client name', () => {
    expect(brandTerms('sc-domain:icloud.co.jp', '株式会社アイクラウド')).toEqual(['icloud', 'アイクラウド']);
    expect(brandTerms('https://www.example.com/', 'Example Inc', ['エグザンプル'])).toEqual(['example', 'exampleinc', 'エグザンプル']);
  });

  it('builds an RE2 pattern that tolerates spaces and escapes symbols', () => {
    expect(termsRegex(['生成AI 研修', 'a.b'])).toBe('(?i)(生成ai[\\s\\x{3000}]*研修|a\\.b)');
    expect(termsRegex([])).toBe('');
  });

  it('keeps the daily total: brand + target + the rest', () => {
    const r = gscToBridge(
      { rows: [{ keys: ['2026-10-01'], impressions: 100, clicks: 10 }] },
      { rows: [{ keys: ['2026-10-01'], impressions: 30, clicks: 6 }] },
      { rows: [{ keys: ['2026-10-01'], impressions: 50, clicks: 3 }] },
      ['icloud'],
    );
    expect(r.records.map((x) => [x.campaign, x.stage, x.metrics.impressions, x.metrics.clicks])).toEqual([
      ['指名検索', 'conversion', 30, 6],
      ['対策キーワード', 'consideration', 50, 3],
      ['その他の検索', 'consideration', 20, 1],
    ]);
  });

  it('reads the last 90 days up to yesterday in Japan time', () => {
    expect(period(90, new Date('2026-10-10T16:00:00Z'))).toEqual({ start: '2026-07-13', end: '2026-10-10' });
  });
});

describe('connecting Google', () => {
  it('reports when the OAuth client is not set up', async () => {
    env = { ...env, GOOGLE_CLIENT_ID: undefined };
    expect(await (await call('GET', '/api/google/status', OWNER)).json()).toMatchObject({ configured: false, connected: false });
  });

  it('stores the refresh token encrypted and shows the account', async () => {
    const res = await connect();
    expect(res.headers.get('location')).toBe('https://app.example/#/settings?google=ok');
    const row = db.prepare('SELECT token, email FROM google_auth').get() as { token: string; email: string };
    expect(row.email).toBe('agency@gmail.com');
    expect(row.token).not.toContain('rt-secret');
    expect(await (await call('GET', '/api/google/status', OWNER)).json()).toMatchObject({ configured: true, connected: true, email: 'agency@gmail.com' });
  });

  it('rejects a callback whose state was not issued for this admin', async () => {
    mockGoogle(tokenEndpoint);
    const res = await call('GET', '/api/google/callback?code=c1&state=forged.sig', OWNER);
    expect(res.headers.get('location')).toContain('google=error');
    expect(db.prepare('SELECT COUNT(*) AS n FROM google_auth').get()).toEqual({ n: 0 });
  });

  it('is for admins only', async () => {
    await call('PUT', '/api/users/viewer@client.example', OWNER, { role: 'viewer', workspaceIds: ['acme'] });
    const res = await call('GET', '/api/google/connect', 'viewer@client.example');
    expect(res.headers.get('location')).toContain('google=error');
    expect((await call('GET', '/api/google/sources', 'viewer@client.example')).status).toBe(403);
  });
});

describe('syncing a client', () => {
  const ga4Report = {
    rows: [
      { dimensionValues: [{ value: '20261001' }, { value: 'Direct' }], metricValues: [{ value: '40' }, { value: '30' }, { value: '2' }, { value: '0' }] },
      { dimensionValues: [{ value: '20261001' }, { value: 'Referral' }], metricValues: [{ value: '10' }, { value: '8' }, { value: '1' }, { value: '5000' }] },
    ],
  };

  beforeEach(async () => {
    await connect();
    await call('PUT', '/api/workspaces/acme', OWNER, {
      workspace: client({ ga4: { property: 'properties/123', name: 'アクメ' }, gsc: { site: 'sc-domain:acme.jp' }, ads: { customerId: '111', loginCustomerId: '999', name: 'アクメ広告' } }),
      initiatives: [],
    });
  });

  it('reads GA4 Direct / Referral and saves it as the GA4 import', async () => {
    const seen = mockGoogle({ ...tokenEndpoint, 'analyticsdata.googleapis.com/v1beta/properties/123:runReport': () => ({ json: ga4Report }) });
    const res = await call('POST', '/api/google/sync/acme/ga4', OWNER);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { import: { rows: { campaign: string; metrics: Record<string, number> }[]; label: string }; workspace: Workspace };
    expect(body.import.rows.map((r) => [r.campaign, r.metrics.sessions])).toEqual([
      ['direct', 40],
      ['referral', 10],
    ]);
    expect(body.workspace.connections.ga4).toMatchObject({ status: 'connected', method: 'oauth' });
    const state = (await (await call('GET', '/api/state', OWNER)).json()) as { imports: Record<string, Record<string, { label: string }>> };
    expect(state.imports.acme.ga4.label).toBe('GA4 自動取得（アクメ）');
    expect(seen.find((s) => s.url.includes('runReport'))?.headers.authorization).toBe('Bearer at');
  });

  it('splits Search Console into brand / target / the rest with three small requests', async () => {
    await call('PUT', '/api/workspaces/acme', OWNER, { workspace: client({ gsc: { site: 'sc-domain:acme.jp', targetKeywords: ['法人研修'] } }), initiatives: [] });
    const seen = mockGoogle({
      ...tokenEndpoint,
      'searchAnalytics/query': (b) => {
        const filters = ((b.dimensionFilterGroups as { filters: { operator: string }[] }[] | undefined)?.[0]?.filters ?? []).map((f) => f.operator).join(',');
        const n = filters === '' ? [100, 10] : filters === 'includingRegex' ? [30, 6] : [50, 3];
        return { json: { rows: [{ keys: ['2026-10-01'], impressions: n[0], clicks: n[1] }] } };
      },
    });
    const body = (await (await call('POST', '/api/google/sync/acme/seo', OWNER)).json()) as { import: { rows: { campaign: string; metrics: Record<string, number> }[] } };
    expect(body.import.rows.map((r) => [r.campaign, r.metrics.impressions])).toEqual([
      ['指名検索', 30],
      ['対策キーワード', 50],
      ['その他の検索', 20],
    ]);
    const filters = seen.filter((s) => s.url.includes('searchAnalytics')).map((s) => JSON.stringify(s.body.dimensionFilterGroups ?? null));
    expect(filters.some((f) => f.includes('acme|アクメ'))).toBe(true);
    expect(filters.some((f) => f.includes('法人研修') && f.includes('excludingRegex'))).toBe(true);
  });

  it('reads Google Ads through the manager account', async () => {
    env = { ...env, GOOGLE_ADS_DEVELOPER_TOKEN: 'devtoken' };
    const seen = mockGoogle({
      ...tokenEndpoint,
      'googleads.googleapis.com/v23/customers/111/googleAds:search': () => ({
        json: {
          results: [
            {
              segments: { date: '2026-10-01' },
              campaign: { name: 'ブランド', advertisingChannelType: 'SEARCH' },
              metrics: { impressions: '100', clicks: '10', costMicros: '2500000000', conversions: 2, conversionsValue: 60000 },
            },
          ],
        },
      }),
    });
    const body = (await (await call('POST', '/api/google/sync/acme/google-ads', OWNER)).json()) as { import: { rows: { metrics: Record<string, number> }[] } };
    expect(body.import.rows[0].metrics).toMatchObject({ cost: 2500, conversions: 2, revenue: 60000 });
    const req = seen.find((s) => s.url.includes('googleAds:search'))!;
    expect(req.headers['developer-token']).toBe('devtoken');
    expect(req.headers['login-customer-id']).toBe('999');
  });

  it('explains a disabled Google API and records the failure', async () => {
    mockGoogle({
      ...tokenEndpoint,
      runReport: () => ({ status: 403, json: { error: { message: 'Google Analytics Data API has not been used in project 1 before or it is disabled.', status: 'PERMISSION_DENIED' } } }),
    });
    const res = await call('POST', '/api/google/sync/acme/ga4', OWNER);
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toContain('Google Analytics Data API');
    const st = (await (await call('GET', '/api/google/sync/acme', OWNER)).json()) as { status: Record<string, { ok: boolean }> };
    expect(st.status.ga4.ok).toBe(false);
  });

  it('asks to reconnect when Google revoked the token', async () => {
    mockGoogle({ 'oauth2.googleapis.com/token': () => ({ status: 400, json: { error: 'invalid_grant' } }) });
    const body = (await (await call('POST', '/api/google/sync/acme/ga4', OWNER)).json()) as { error: string; reauth: boolean };
    expect(body).toMatchObject({ reauth: true });
    expect(body.error).toContain('連携し直して');
  });

  it('lets a viewer refresh only stale data, and never a demo company', async () => {
    await call('PUT', '/api/users/viewer@client.example', OWNER, { role: 'viewer', workspaceIds: ['acme', 'nexa'] });
    mockGoogle({ ...tokenEndpoint, runReport: () => ({ json: ga4Report }) });
    expect((await call('POST', '/api/google/sync/acme/ga4', 'viewer@client.example')).status).toBe(200);
    expect((await call('POST', '/api/google/sync/acme/ga4', 'viewer@client.example')).status).toBe(429);
    expect((await call('POST', '/api/google/sync/acme/ga4', OWNER)).status).toBe(200);
    await call('PUT', '/api/workspaces/nexa', OWNER, { workspace: { ...structuredClone(SAMPLE_WORKSPACES[0]) }, initiatives: [] });
    expect((await call('POST', '/api/google/sync/nexa/ga4', OWNER)).status).toBe(400);
  });
});
