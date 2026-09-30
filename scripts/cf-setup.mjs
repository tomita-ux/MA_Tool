#!/usr/bin/env node
// One-shot Cloudflare setup for MA Compass (docs/06-deployment.md §8).
// Creates/reuses: D1 database, Pages project, Google login for Access, the Access application
// protecting the Pages URL, an allow policy, and the Pages environment variables.
//
// Required environment variables:
//   CLOUDFLARE_API_TOKEN   token with: Account › D1 Edit, Cloudflare Pages Edit, Access: Apps and Policies Edit,
//                          Access: Organizations, Identity Providers, and Groups Edit, Account Settings Read
//   CLOUDFLARE_ACCOUNT_ID
//   ADMIN_EMAILS           first admin Google account(s), comma separated
// Optional:
//   GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET   adds Google as the Access login method
//   ALLOWED_EMAILS         extra emails allowed to sign in (viewers), comma separated
//   PROJECT                Pages project name (default: ma-compass)
//
// Usage: node scripts/cf-setup.mjs   (then: npm run cf:deploy)
import { readFileSync, writeFileSync } from 'node:fs';

const env = process.env;
// test hook: point the script at a mock API
const API = env.CF_API_BASE || 'https://api.cloudflare.com/client/v4';
const TOKEN = env.CLOUDFLARE_API_TOKEN;
const ACCOUNT = env.CLOUDFLARE_ACCOUNT_ID;
const PROJECT = env.PROJECT || 'ma-compass';
const ADMINS = (env.ADMIN_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean);
const ALLOWED = [...new Set([...ADMINS, ...(env.ALLOWED_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean)])];
if (!TOKEN || !ACCOUNT || !ADMINS.length) {
  console.error('CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, ADMIN_EMAILS を設定してください。');
  process.exit(1);
}

async function cf(method, path, body) {
  const res = await fetch(`${API}/accounts/${ACCOUNT}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!json.success) throw new Error(`${method} ${path}: ${JSON.stringify(json.errors ?? json).slice(0, 400)}`);
  return json.result;
}
const step = (msg) => console.log(`\n▶ ${msg}`);

// 1. D1
step('D1 データベース');
const dbs = await cf('GET', '/d1/database?name=ma-compass');
const db = dbs.find((d) => d.name === 'ma-compass') ?? (await cf('POST', '/d1/database', { name: 'ma-compass' }));
console.log(`  database_id: ${db.uuid}`);
const tomlPath = env.WRANGLER_TOML || 'wrangler.toml';
const toml = readFileSync(tomlPath, 'utf8').replace(/database_id = ".*"/, `database_id = "${db.uuid}"`);
writeFileSync(tomlPath, toml);

// 2. Pages project
step('Pages プロジェクト');
let project;
try {
  project = await cf('GET', `/pages/projects/${PROJECT}`);
} catch {
  project = await cf('POST', '/pages/projects', { name: PROJECT, production_branch: 'main' });
}
const host = project.subdomain || `${PROJECT}.pages.dev`;
console.log(`  URL: https://${host}`);

// 3. Access organisation (team domain) — created in the dashboard when Zero Trust is enabled
step('Zero Trust チーム');
const org = await cf('GET', '/access/organizations');
const teamDomain = `https://${org.auth_domain}`;
console.log(`  ${teamDomain}`);

// 4. Google login
step('Google ログイン');
const idps = await cf('GET', '/access/identity_providers');
let google = idps.find((i) => i.type === 'google');
if (!google && env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET) {
  google = await cf('POST', '/access/identity_providers', {
    name: 'Google',
    type: 'google',
    config: { client_id: env.GOOGLE_OAUTH_CLIENT_ID, client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET },
  });
}
console.log(google ? '  設定済み' : '  未設定（GOOGLE_OAUTH_CLIENT_ID / SECRET を指定して再実行してください）');

// 5. Access application + allow policy
step('Access アプリケーション');
const apps = await cf('GET', '/access/apps');
const domains = [host, `*.${host}`];
let app = apps.find((a) => a.domain === host);
const appBody = {
  name: 'MA Compass',
  type: 'self_hosted',
  domain: host,
  self_hosted_domains: domains,
  session_duration: '24h',
  ...(google ? { allowed_idps: [google.id], auto_redirect_to_identity: true } : {}),
};
app = app ? await cf('PUT', `/access/apps/${app.id}`, appBody) : await cf('POST', '/access/apps', appBody);
console.log(`  AUD: ${app.aud}`);
const policies = await cf('GET', `/access/apps/${app.id}/policies`);
const policyBody = { name: 'MA Compass users', decision: 'allow', include: ALLOWED.map((email) => ({ email: { email } })), precedence: 1 };
const existing = policies.find((p) => p.name === policyBody.name);
if (existing) await cf('PUT', `/access/apps/${app.id}/policies/${existing.id}`, policyBody);
else await cf('POST', `/access/apps/${app.id}/policies`, policyBody);
console.log(`  許可: ${ALLOWED.join(', ')}`);

// 6. Pages environment variables
step('Pages シークレット');
// wrangler.toml is the source of truth for Pages config, so these go in as secrets (not in the public repo)
const vars = {
  ACCESS_TEAM_DOMAIN: { type: 'secret_text', value: teamDomain },
  ACCESS_AUD: { type: 'secret_text', value: app.aud },
  ADMIN_EMAILS: { type: 'secret_text', value: ADMINS.join(',') },
};
await cf('PATCH', `/pages/projects/${PROJECT}`, {
  deployment_configs: { production: { env_vars: vars }, preview: { env_vars: vars } },
});
console.log('  ACCESS_TEAM_DOMAIN / ACCESS_AUD / ADMIN_EMAILS をシークレットとして登録しました（D1 は wrangler.toml に記入済み）');

console.log(`\n完了。次に npm run cf:deploy を実行すると https://${host} で公開されます。`);
