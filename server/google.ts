import { normalizeBridgeRows } from '../src/core/data/bridge';
import type { ModuleImport } from '../src/core/data/dataset';
import { fromAdsBiBridge, fromGaBridge, fromSeoBridge, type ConnectorResult } from '../src/core/connectors';
import type { Workspace } from '../src/core/types';
import { getModule } from '../src/modules';
import { brandTerms, termsRegex } from '../src/core/searchTerms';

export { brandTerms, termsRegex };
import type { Env } from './types';

// MA Compass reads GA4, Search Console and Google Ads directly (docs/06-deployment.md §8.10).
// One Google account is connected by an admin (OAuth, offline). Its refresh token is stored in D1,
// encrypted with TOKEN_KEY. Each sync fetches one module for one client and saves it as that
// module's import — the same shape the local tools' bridge APIs produce, through the same converters.

export const GOOGLE_MODULES = ['ga4', 'seo', 'google-ads'] as const;
export type GoogleModule = (typeof GOOGLE_MODULES)[number];

const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/adwords',
];
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DAYS = 90;

export class GoogleError extends Error {
  constructor(
    message: string,
    public reauth = false,
  ) {
    super(message);
  }
}

export const googleConfigured = (env: Env) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.TOKEN_KEY);
export const adsConfigured = (env: Env) => Boolean(env.GOOGLE_ADS_DEVELOPER_TOKEN);
/**
 * Google Ads API access is approved per Google Cloud project. When the project behind
 * GOOGLE_CLIENT_ID is test-only, Ads can be read with ads-bi-dashboard's own (approved) OAuth credentials.
 */
export const adsOwnCredentials = (env: Env) => Boolean(env.GOOGLE_ADS_CLIENT_ID && env.GOOGLE_ADS_CLIENT_SECRET && env.GOOGLE_ADS_REFRESH_TOKEN);
const adsVersion = (env: Env) => env.GOOGLE_ADS_API_VERSION || 'v23';

// ─── crypto (AES-GCM for the stored token, HMAC for the OAuth state) ───

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (bytes: Uint8Array) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => unb64(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));

function keyBytes(env: Env) {
  const raw = env.TOKEN_KEY ? unb64(env.TOKEN_KEY) : new Uint8Array();
  if (raw.length !== 32) throw new GoogleError('TOKEN_KEY は 32 バイト（base64）で設定してください');
  return raw;
}

export async function encrypt(env: Env, text: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', keyBytes(env), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text)));
  return `v1:${b64(iv)}:${b64(ct)}`;
}

export async function decrypt(env: Env, value: string): Promise<string> {
  const [v, iv, ct] = value.split(':');
  if (v !== 'v1' || !iv || !ct) throw new GoogleError('保存されたトークンを読めません。Google と連携し直してください', true);
  const key = await crypto.subtle.importKey('raw', keyBytes(env), 'AES-GCM', false, ['decrypt']);
  try {
    return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct)));
  } catch {
    throw new GoogleError('保存されたトークンを読めません（TOKEN_KEY が変わった可能性）。Google と連携し直してください', true);
  }
}

async function hmac(env: Env, data: string) {
  const key = await crypto.subtle.importKey('raw', keyBytes(env), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data))));
}

/** OAuth state: who started it and when, signed so the callback can trust it. */
export async function signState(env: Env, email: string, now = Date.now()) {
  const payload = b64url(enc.encode(JSON.stringify({ e: email, t: now, n: b64url(crypto.getRandomValues(new Uint8Array(8))) })));
  return `${payload}.${await hmac(env, payload)}`;
}

export async function verifyState(env: Env, state: string, email: string, now = Date.now()): Promise<boolean> {
  const [payload, sig] = state.split('.');
  if (!payload || !sig || (await hmac(env, payload)) !== sig) return false;
  try {
    const { e, t } = JSON.parse(dec.decode(unb64url(payload))) as { e: string; t: number };
    return e === email && now - t < 10 * 60_000 && now >= t;
  } catch {
    return false;
  }
}

// ─── OAuth ───

export const redirectUri = (origin: string) => `${origin}/api/google/callback`;

export function authUrl(env: Env, origin: string, state: string) {
  const q = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: redirectUri(origin),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function tokenRequest(env: Env, params: Record<string, string>, client = { id: env.GOOGLE_CLIENT_ID ?? '', secret: env.GOOGLE_CLIENT_SECRET ?? '' }) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: client.id, client_secret: client.secret, ...params }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, string>;
  if (!res.ok) {
    if (body.error === 'invalid_grant') throw new GoogleError('Google との連携が切れています。設定から Google と連携し直してください', true);
    throw new GoogleError(`Google の認証に失敗しました（${body.error_description || body.error || res.status}）`);
  }
  return body;
}

/** Code → refresh token + the Google account's email. */
export async function exchangeCode(env: Env, code: string, origin: string) {
  const t = await tokenRequest(env, { code, grant_type: 'authorization_code', redirect_uri: redirectUri(origin) });
  if (!t.refresh_token) throw new GoogleError('Google から更新用のトークンが返りませんでした。もう一度連携してください');
  let email = '';
  try {
    email = (JSON.parse(dec.decode(unb64url(t.id_token.split('.')[1]))) as { email?: string }).email ?? '';
  } catch {
    /* email is informational only */
  }
  return { refreshToken: t.refresh_token, scope: t.scope ?? '', email };
}

export async function saveConnection(env: Env, by: string, c: { refreshToken: string; scope: string; email: string }) {
  await env.DB.prepare(
    `INSERT INTO google_auth (id, email, token, scopes, connected_at, connected_by) VALUES ('default', ?, ?, ?, datetime('now'), ?)
     ON CONFLICT(id) DO UPDATE SET email = excluded.email, token = excluded.token, scopes = excluded.scopes, connected_at = excluded.connected_at, connected_by = excluded.connected_by`,
  )
    .bind(c.email, await encrypt(env, c.refreshToken), c.scope, by)
    .run();
}

export async function connection(env: Env) {
  return env.DB.prepare("SELECT email, scopes, connected_at FROM google_auth WHERE id = 'default'").first<{ email: string; scopes: string; connected_at: string }>();
}

export async function accessToken(env: Env): Promise<string> {
  if (!googleConfigured(env)) throw new GoogleError('Google 連携の設定（GOOGLE_CLIENT_ID など）がまだです');
  const row = await env.DB.prepare("SELECT token FROM google_auth WHERE id = 'default'").first<{ token: string }>();
  if (!row) throw new GoogleError('Google と連携されていません。設定の「Google と連携」から連携してください', true);
  const t = await tokenRequest(env, { grant_type: 'refresh_token', refresh_token: await decrypt(env, row.token) });
  return t.access_token;
}

/** Token for Google Ads: ads-bi-dashboard's credentials when registered, else the connected account. */
export async function adsAccessToken(env: Env, connected?: string): Promise<string> {
  if (!adsOwnCredentials(env)) return connected ?? accessToken(env);
  try {
    const t = await tokenRequest(env, { grant_type: 'refresh_token', refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN ?? '' }, { id: env.GOOGLE_ADS_CLIENT_ID ?? '', secret: env.GOOGLE_ADS_CLIENT_SECRET ?? '' });
    return t.access_token;
  } catch (e) {
    // reconnecting the main account does not help here
    throw new GoogleError(`Google 広告の認証（ads-bi-dashboard と同じ GOOGLE_ADS_REFRESH_TOKEN など）が使えません：${(e as Error).message}`);
  }
}

// ─── Google APIs ───

const API_HINT: [RegExp, string][] = [
  [/analyticsdata|Analytics Data API/i, 'Google Analytics Data API'],
  [/analyticsadmin|Analytics Admin API/i, 'Google Analytics Admin API'],
  [/searchconsole|webmasters|Search Console API/i, 'Google Search Console API'],
  [/googleads|Google Ads API/i, 'Google Ads API'],
];

// Google Ads puts the real reason in error.details[].errors[] (GoogleAdsFailure)
const ADS_REASON: Record<string, string> = {
  DEVELOPER_TOKEN_NOT_APPROVED: '開発者トークンが「テスト用」のため、本番の広告アカウントを読めません（Google 広告の API センターで基本アクセスを申請）',
  DEVELOPER_TOKEN_PROHIBITED: 'この開発者トークンは別の Google Cloud プロジェクトで使われています。ads-bi-dashboard と同じプロジェクトの OAuth クライアントが必要です',
  USER_PERMISSION_DENIED: '連携している Google アカウントにこの広告アカウントの権限がありません（MCC 経由の場合は MCC の権限が必要）',
  NOT_ADS_USER: '連携している Google アカウントは Google 広告を利用していません。広告アカウントにこの Google アカウントを追加するか、広告を管理している Google アカウントで連携し直してください',
  CUSTOMER_NOT_ENABLED: 'この広告アカウントは無効（停止・解約）です',
};

export function adsFailure(details: unknown): string | undefined {
  for (const d of Array.isArray(details) ? details : []) {
    for (const e of (d as { errors?: { errorCode?: Record<string, string>; message?: string }[] }).errors ?? []) {
      const code = Object.values(e.errorCode ?? {})[0];
      if (code) return ADS_REASON[code] ?? `${code}：${e.message ?? ''}`;
      if (e.message) return e.message;
    }
  }
  return undefined;
}

async function gapi<T>(url: string, token: string, init: RequestInit & { headers?: Record<string, string> } = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...init.headers } });
  const text = await res.text();
  let body: { error?: { message?: string; status?: string; details?: unknown } } & Record<string, unknown> = {};
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON error page */
  }
  if (res.ok) return body as T;
  const ads = adsFailure(body.error?.details);
  if (ads) throw new GoogleError(`Google 広告：${ads}`);
  const msg = body.error?.message ?? text.slice(0, 200);
  if (/has not been used in project|is disabled|SERVICE_DISABLED/i.test(msg)) {
    const api = API_HINT.find(([re]) => re.test(url) || re.test(msg))?.[1] ?? 'API';
    throw new GoogleError(`Google Cloud で「${api}」が有効になっていません。Google Cloud のプロジェクトで有効にしてください`);
  }
  if (res.status === 401) throw new GoogleError('Google との連携が切れています。設定から Google と連携し直してください', true);
  if (res.status === 403) throw new GoogleError(`連携している Google アカウントに閲覧権限がありません（${msg.slice(0, 160)}）`);
  if (res.status === 404) throw new GoogleError('指定したプロパティ・サイト・アカウントが見つかりません。設定の取得元を確認してください');
  throw new GoogleError(`Google API がエラーを返しました（${res.status}：${msg.slice(0, 160)}）`);
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Yesterday back to `days` days, in Japan time. */
export function period(days = DAYS, now = new Date()) {
  const jst = new Date(now.getTime() + 9 * 3600_000);
  const end = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() - 1));
  const start = new Date(end.getTime() - (days - 1) * 86400_000);
  return { start: isoDay(start), end: isoDay(end) };
}

// GA4 — only Direct / Referral (the other channels come from their own modules)
interface Ga4Report {
  rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[];
}

export async function fetchGa4(token: string, property: string, p = period()) {
  const report = await gapi<Ga4Report>(`https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, token, {
    method: 'POST',
    body: JSON.stringify({
      dateRanges: [{ startDate: p.start, endDate: p.end }],
      dimensions: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }, { name: 'engagedSessions' }, { name: 'keyEvents' }, { name: 'totalRevenue' }],
      dimensionFilter: { filter: { fieldName: 'sessionDefaultChannelGroup', inListFilter: { values: ['Direct', 'Referral'] } } },
      limit: 10000,
    }),
  });
  return ga4ToBridge(report);
}

export function ga4ToBridge(report: Ga4Report) {
  return {
    source: 'ga-dashboard',
    records: (report.rows ?? []).map((r) => {
      const d = r.dimensionValues[0]?.value ?? '';
      const v = r.metricValues.map((m) => Number(m.value) || 0);
      return {
        date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
        channelGroup: r.dimensionValues[1]?.value ?? '',
        metrics: { sessions: v[0], engagements: v[1], conversions: v[2], revenue: v[3] },
      };
    }),
  };
}

// Search Console — split into 指名検索 / 対策キーワード / その他の検索 like seo-dashboard's bridge (group=1).
// Three small date-only requests with regex filters instead of pulling every query.
type GscRows = { rows?: { keys: string[]; clicks: number; impressions: number }[] };

export async function fetchGsc(token: string, site: string, brands: string[], targets: string[], p = period()) {
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
  const brandRe = termsRegex(brands);
  const targetRe = termsRegex(targets);
  const query = (filters: { dimension: string; operator: string; expression: string }[]) =>
    gapi<GscRows>(url, token, {
      method: 'POST',
      body: JSON.stringify({ startDate: p.start, endDate: p.end, dimensions: ['date'], rowLimit: 1000, ...(filters.length ? { dimensionFilterGroups: [{ filters }] } : {}) }),
    });
  const [total, brand, target] = await Promise.all([
    query([]),
    brandRe ? query([{ dimension: 'query', operator: 'includingRegex', expression: brandRe }]) : Promise.resolve({} as GscRows),
    targetRe
      ? query([
          { dimension: 'query', operator: 'includingRegex', expression: targetRe },
          ...(brandRe ? [{ dimension: 'query', operator: 'excludingRegex', expression: brandRe }] : []),
        ])
      : Promise.resolve({} as GscRows),
  ]);
  return gscToBridge(total, brand, target, brands);
}

export function gscToBridge(total: GscRows, brand: GscRows, target: GscRows, brands: string[]) {
  const byDate = (r: GscRows) => new Map((r.rows ?? []).map((x) => [x.keys[0], x]));
  const b = byDate(brand);
  const t = byDate(target);
  const records: { date: string; campaign: string; segment: string; stage: string; metrics: { impressions: number; clicks: number } }[] = [];
  for (const row of total.rows ?? []) {
    const date = row.keys[0];
    const bi = b.get(date)?.impressions ?? 0;
    const bc = b.get(date)?.clicks ?? 0;
    const ti = t.get(date)?.impressions ?? 0;
    const tc = t.get(date)?.clicks ?? 0;
    const groups: [string, string, number, number][] = [
      ['指名検索', 'conversion', bi, bc],
      ['対策キーワード', 'consideration', ti, tc],
      // the rest, including queries Search Console keeps anonymous, so the total matches the daily figure
      ['その他の検索', 'consideration', Math.max(0, row.impressions - bi - ti), Math.max(0, row.clicks - bc - tc)],
    ];
    for (const [campaign, stage, impressions, clicks] of groups) {
      if (impressions || clicks) records.push({ date, campaign, segment: '', stage, metrics: { impressions, clicks } });
    }
  }
  return { source: 'seo-dashboard', grouping: 'query-group', brandTerms: brands, records };
}

// Google Ads
interface AdsRow {
  segments?: { date?: string };
  campaign?: { name?: string; advertisingChannelType?: string };
  metrics?: { impressions?: string; clicks?: string; costMicros?: string; conversions?: number; conversionsValue?: number };
  customer?: { id?: string; descriptiveName?: string; manager?: boolean };
  customerClient?: { id?: string; descriptiveName?: string; manager?: boolean };
}

function adsHeaders(env: Env, loginCustomerId?: string): Record<string, string> {
  return { 'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '', ...(loginCustomerId ? { 'login-customer-id': loginCustomerId } : {}) };
}

async function adsSearch(env: Env, token: string, customerId: string, query: string, loginCustomerId?: string) {
  const rows: AdsRow[] = [];
  let pageToken: string | undefined;
  do {
    const res = await gapi<{ results?: AdsRow[]; nextPageToken?: string }>(`https://googleads.googleapis.com/${adsVersion(env)}/customers/${customerId}/googleAds:search`, token, {
      method: 'POST',
      headers: adsHeaders(env, loginCustomerId),
      body: JSON.stringify({ query, ...(pageToken ? { pageToken } : {}) }),
    });
    rows.push(...(res.results ?? []));
    pageToken = res.nextPageToken;
  } while (pageToken && rows.length < 50_000);
  return rows;
}

export async function fetchAds(env: Env, token: string, customerId: string, loginCustomerId: string | undefined, p = period()) {
  if (!adsConfigured(env)) throw new GoogleError('Google 広告の開発者トークン（GOOGLE_ADS_DEVELOPER_TOKEN）が未設定です');
  const rows = await adsSearch(
    env,
    token,
    customerId,
    `SELECT segments.date, campaign.name, campaign.advertising_channel_type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '${p.start}' AND '${p.end}'`,
    loginCustomerId,
  );
  return adsToBridge(rows);
}

export function adsToBridge(rows: AdsRow[]) {
  const records = rows.map((r) => ({
    date: r.segments?.date ?? '',
    campaign: r.campaign?.name ?? '(不明)',
    channelType: r.campaign?.advertisingChannelType ?? '',
    metrics: {
      impressions: Number(r.metrics?.impressions ?? 0),
      clicks: Number(r.metrics?.clicks ?? 0),
      cost: Number(r.metrics?.costMicros ?? 0) / 1e6,
      conversions: Number(r.metrics?.conversions ?? 0),
      revenue: Number(r.metrics?.conversionsValue ?? 0),
    },
  }));
  return { source: 'ads-bi-dashboard', revenueSource: records.some((r) => r.metrics.revenue > 0) ? 'conversions_value' : 'none', records };
}

// ─── pickers ───

export async function listSources(env: Env, token: string) {
  const out: {
    ga4: { property: string; name: string; account: string }[];
    gsc: { site: string; permission: string }[];
    ads: { customerId: string; name: string; loginCustomerId?: string }[];
    errors: string[];
  } = { ga4: [], gsc: [], ads: [], errors: [] };
  const tasks: Promise<void>[] = [];
  tasks.push(
    gapi<{ accountSummaries?: { displayName: string; propertySummaries?: { property: string; displayName: string }[] }[] }>(
      'https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200',
      token,
    )
      .then((r) => {
        for (const a of r.accountSummaries ?? []) for (const p of a.propertySummaries ?? []) out.ga4.push({ property: p.property, name: p.displayName, account: a.displayName });
      })
      .catch((e) => void out.errors.push(`GA4：${(e as Error).message}`)),
  );
  tasks.push(
    gapi<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>('https://searchconsole.googleapis.com/webmasters/v3/sites', token)
      .then((r) => {
        for (const s of r.siteEntry ?? []) if (s.permissionLevel !== 'siteUnverifiedUser') out.gsc.push({ site: s.siteUrl, permission: s.permissionLevel });
      })
      .catch((e) => void out.errors.push(`Search Console：${(e as Error).message}`)),
  );
  if (adsConfigured(env))
    tasks.push(
      adsAccessToken(env, token)
        .then((t) => listAdsCustomers(env, t, out.ads, out.errors))
        .catch((e) => void out.errors.push(`Google 広告：${(e as Error).message.replace(/^Google 広告：/, '')}`)),
    );
  await Promise.all(tasks);
  out.ga4.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  out.gsc.sort((a, b) => a.site.localeCompare(b.site));
  out.ads.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  return out;
}

/** Accounts the Google account can reach — directly, or as the clients under a manager (MCC) account. */
async function listAdsCustomers(env: Env, token: string, into: { customerId: string; name: string; loginCustomerId?: string }[], errors: string[]) {
  const r = await gapi<{ resourceNames?: string[] }>(`https://googleads.googleapis.com/${adsVersion(env)}/customers:listAccessibleCustomers`, token, { headers: adsHeaders(env) });
  const ids = (r.resourceNames ?? []).map((n) => n.split('/')[1]).slice(0, 15);
  if (!ids.length) {
    errors.push(`Google 広告：${ADS_REASON.NOT_ADS_USER}`);
    return;
  }
  const failed = new Map<string, string>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const [me] = await adsSearch(env, token, id, 'SELECT customer.id, customer.descriptive_name, customer.manager FROM customer LIMIT 1', id);
        if (!me?.customer?.manager) {
          into.push({ customerId: id, name: me?.customer?.descriptiveName || id });
          return;
        }
        const children = await adsSearch(
          env,
          token,
          id,
          "SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager FROM customer_client WHERE customer_client.level = 1 AND customer_client.status = 'ENABLED'",
          id,
        );
        for (const c of children) {
          if (c.customerClient?.id && !c.customerClient.manager) into.push({ customerId: String(c.customerClient.id), name: c.customerClient.descriptiveName || String(c.customerClient.id), loginCustomerId: id });
        }
      } catch (e) {
        // accounts that cannot be read are left out; the reason is shown when nothing is left
        failed.set(id, (e as Error).message.replace(/^Google 広告：/, ''));
      }
    }),
  );
  if (!into.length && failed.size) {
    const fmt = (id: string) => id.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
    for (const [reason, list] of groupBy(failed)) errors.push(`Google 広告：${list.map(fmt).join('、')} を読めません（${reason}）`);
  }
}

const groupBy = (m: Map<string, string>) => {
  const out = new Map<string, string[]>();
  for (const [id, reason] of m) out.set(reason, [...(out.get(reason) ?? []), id]);
  return out;
};

// ─── sync one module for one client ───

export interface SyncResult {
  import: ModuleImport;
  workspace: Workspace;
  message: string;
}

export async function syncModule(env: Env, ws: Workspace, moduleId: GoogleModule, now = new Date()): Promise<SyncResult> {
  const g = ws.google ?? {};
  // Ads may use its own credentials, so the connected account's token is only fetched for GA4 / Search Console
  const token = moduleId === 'google-ads' ? '' : await accessToken(env);
  const p = period(DAYS, now);
  let result: ConnectorResult;
  let label: string;
  const range = `${p.start}〜${p.end}`;
  if (moduleId === 'ga4') {
    if (!g.ga4?.property) throw new GoogleError('GA4 のプロパティが選ばれていません');
    if (!/^properties\/\d+$/.test(g.ga4.property)) throw new GoogleError('GA4 のプロパティ ID の形式が正しくありません');
    const data = await fetchGa4(token, g.ga4.property, p);
    if (!data.records.length) throw new GoogleError(`${range} に GA4 のダイレクト・参照のデータがありません`);
    result = fromGaBridge(data);
    label = `GA4 自動取得（${g.ga4.name ?? g.ga4.property}）`;
  } else if (moduleId === 'seo') {
    if (!g.gsc?.site) throw new GoogleError('Search Console のサイトが選ばれていません');
    const brands = brandTerms(g.gsc.site, ws.name, g.gsc.brandTerms);
    const targets = g.gsc.targetKeywords?.length ? g.gsc.targetKeywords : (ws.keywords ?? []).map((k) => k.keyword);
    const data = await fetchGsc(token, g.gsc.site, brands, targets, p);
    if (!data.records.length) throw new GoogleError(`${range} に Search Console のデータがありません`);
    result = fromSeoBridge(data);
    label = `Search Console 自動取得（${g.gsc.site}）`;
  } else {
    if (!g.ads?.customerId) throw new GoogleError('Google 広告のアカウントが選ばれていません');
    if (!/^\d+$/.test(g.ads.customerId) || (g.ads.loginCustomerId && !/^\d+$/.test(g.ads.loginCustomerId))) throw new GoogleError('Google 広告のアカウント ID の形式が正しくありません');
    const data = await fetchAds(env, await adsAccessToken(env), g.ads.customerId, g.ads.loginCustomerId || env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, '') || undefined, p);
    if (!data.records.length) throw new GoogleError(`${range} に Google 広告の配信実績がありません`);
    result = fromAdsBiBridge(data);
    label = `Google 広告 自動取得（${g.ads.name ?? g.ads.customerId}）`;
  }
  if (result.kind === 'error') throw new GoogleError(result.message);
  if (result.kind !== 'bridge') throw new GoogleError('想定外の形式です');
  const module = getModule(ws, moduleId);
  if (!module) throw new GoogleError('モジュールが見つかりません');
  const norm = normalizeBridgeRows(result.rows, module, ws.segments);
  const workspace: Workspace = {
    ...ws,
    enabledModules: ws.enabledModules.includes(moduleId) ? ws.enabledModules : [...ws.enabledModules, moduleId],
    connections: { ...ws.connections, [moduleId]: { status: 'connected', method: 'oauth', account: label, connectedAt: now.toISOString() } },
  };
  return {
    import: { rows: norm.validRows, importedAt: now.toISOString(), label },
    workspace,
    message: `${module.shortName ?? module.name}に ${norm.accepted} 行を取り込みました（${p.start}〜${p.end}）`,
  };
}
