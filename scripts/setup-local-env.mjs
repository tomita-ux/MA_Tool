#!/usr/bin/env node
// Sets up the .env of the four local tools so the public MA Compass can read their data
// (docs/06-deployment.md §8.9). Run it in the folder that holds the tools:
//
//   node setup-local-env.mjs [folder]
//
// - creates .env (with only these keys) when there is none — copying .env.example would bring its
//   placeholder values and change how a tool that runs fine today behaves
// - one shared BRIDGE_TOKEN (reuses an existing one), SECRETS_KEY for seo-dashboard (kept if set)
// - adds MA Compass to each tool's allowed origins, sns-dashboard on port 3003
// Existing values are kept; only these keys are added or changed. Safe to run again.

import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ORIGINS = ['http://localhost:5173', 'https://ma-compass.pages.dev'];

const TOOLS = [
  { name: 'ads-bi-dashboard', origins: 'CORS_ALLOWED_ORIGINS' },
  { name: 'GA-Dashboard', origins: 'BRIDGE_ALLOWED_ORIGINS' },
  { name: 'seo-dashboard', origins: 'BRIDGE_ALLOWED_ORIGINS', secretsKey: true },
  { name: 'sns-dashboard', origins: 'CORS_ALLOWED_ORIGINS', port: '3003' },
];

const root = resolve(process.argv[2] ?? '.');
const newSecret = () => randomBytes(32).toString('base64');

function findDir(name) {
  const hit = readdirSync(root).find((d) => d.toLowerCase() === name.toLowerCase() && statSync(join(root, d)).isDirectory());
  return hit && join(root, hit);
}

/** KEY=value lines that are in effect (not commented out). */
function readEnv(text) {
  const vars = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) vars[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return vars;
}

/** Replace the active KEY= line, or append it at the end. */
function setVar(text, key, value) {
  const re = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=.*$`, 'm');
  if (re.test(text)) return text.replace(re, `${key}=${value}`);
  const body = text.replace(/\s*$/, '');
  return `${body ? body + '\n' : ''}${key}=${value}\n`;
}

if (!existsSync(root) || !statSync(root).isDirectory()) {
  console.error(`\n✗ フォルダ ${root} がありません。場所を確かめてください。\n`);
  process.exit(1);
}

const found = TOOLS.map((t) => ({ ...t, dir: findDir(t.name) }));
const missing = found.filter((t) => !t.dir);
if (missing.length === TOOLS.length) {
  console.error(`\n✗ ${root} にツールのフォルダが見つかりません。`);
  console.error('  ads-bi-dashboard などのフォルダが並んでいる場所で実行するか、その場所を指定してください：');
  console.error('  node setup-local-env.mjs ~/フォルダの場所\n');
  process.exit(1);
}

// .env files (created empty when missing)
const envs = found
  .filter((t) => t.dir)
  .map((t) => {
    const file = join(t.dir, '.env');
    let created = false;
    if (!existsSync(file)) {
      writeFileSync(file, '');
      created = true;
    }
    return { ...t, file, created, text: readFileSync(file, 'utf8') };
  });

// one shared token: reuse the first one already set
const token = envs.map((e) => readEnv(e.text).BRIDGE_TOKEN).find((v) => v) ?? newSecret();

console.log(`\nフォルダ：${root}\n`);
for (const e of envs) {
  const vars = readEnv(e.text);
  const changed = [];
  let text = e.text;

  if (vars.BRIDGE_TOKEN !== token) {
    if (vars.BRIDGE_TOKEN) {
      console.log(`  ! ${e.name}：別の合言葉が設定済みのため変更しません（MA Compass ではこのツールだけその合言葉を入力）`);
    } else {
      text = setVar(text, 'BRIDGE_TOKEN', token);
      changed.push('合言葉');
    }
  }

  const current = (vars[e.origins] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const merged = [...current, ...ORIGINS.filter((o) => !current.includes(o))];
  if (merged.length !== current.length) {
    text = setVar(text, e.origins, merged.join(','));
    changed.push('接続許可');
  }

  if (e.secretsKey && !vars.SECRETS_KEY) {
    text = setVar(text, 'SECRETS_KEY', newSecret());
    changed.push('暗号化キー');
  }

  if (e.port && vars.PORT !== e.port) {
    text = setVar(text, 'PORT', e.port);
    changed.push(`ポート ${e.port}`);
  }

  if (text !== e.text) writeFileSync(e.file, text);
  const what = changed.length ? changed.join('・') + ' を設定' : '設定済み（変更なし）';
  console.log(`  ✓ ${e.name}：${e.created ? '.env を作成し、' : ''}${what}`);
}
for (const t of missing) console.log(`  - ${t.name}：フォルダが見つからないためスキップ`);

console.log(`
──────────────────────────────────────────────
MA Compass の「まとめて更新」で入力する合言葉：

  ${token}

パスワード管理ツールなどに控えてください（チャットや GitHub には貼らない）。
──────────────────────────────────────────────

次にすること：ツールをすべて止めて、起動し直す（.env は起動時に読み込まれます）。
`);
