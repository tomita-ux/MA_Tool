#!/usr/bin/env node
// 手元の 4 ツール（ads-bi / GA / seo / sns）の .env に MA Compass 連携の設定を書き込む。
// 手順の背景: docs/06-deployment.md §8.9 とローカル設定手順書。
//
//   node setup-local-env.mjs
//
// - 合言葉（BRIDGE_TOKEN）と暗号化キー（SECRETS_KEY）は画面に表示しない入力で受け取り、ログにも出さない
// - 許可リスト（*_ALLOWED_ORIGINS）は既存の値を残したまま https://ma-compass.pages.dev を足す
// - seo-dashboard に暗号化キーが既にあれば変えない（変えると保存済みの API キーが読めなくなる）
// - 書き換える前の .env は ~/.ma-compass-env-backup/ に控える（リポジトリの外なので GitHub に載らない）
// - ツールの場所は MA_PROJECTS_DIR（既定: ~/Documents/Claude/Projects）
// - 入力できない環境（テスト）では MA_ENV_BRIDGE_TOKEN / MA_ENV_SECRETS_KEY を使う
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import readline from 'node:readline';

const PUBLIC_ORIGIN = 'https://ma-compass.pages.dev';
const LOCAL_ORIGIN = 'http://localhost:5173';
const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:8788'];

const BASE = process.env.MA_PROJECTS_DIR || join(homedir(), 'Documents', 'Claude', 'Projects');
const TOOLS = [
  { label: 'ads-bi-dashboard', dir: '広告ダッシュボード', repo: 'ads-bi-dashboard', originsKey: 'CORS_ALLOWED_ORIGINS' },
  { label: 'GA-Dashboard', dir: 'GA分析', repo: 'ga-dashboard', originsKey: 'BRIDGE_ALLOWED_ORIGINS' },
  { label: 'seo-dashboard', dir: join('SEOダッシュボード', 'seo-dashboard'), repo: 'seo-dashboard', originsKey: 'BRIDGE_ALLOWED_ORIGINS', secretsKey: true },
  { label: 'sns-dashboard', dir: 'SNSダッシュボード', repo: 'sns-dashboard', originsKey: 'CORS_ALLOWED_ORIGINS', port: '3003' },
];

// ── .env の読み書き ──
const lineRe = (key) => new RegExp(`^[ \\t]*(?:export[ \\t]+)?${key}[ \\t]*=(.*)$`, 'gm');

function getValue(text, key) {
  let value;
  for (const m of text.matchAll(lineRe(key))) value = m[1].trim().replace(/^(['"])(.*)\1$/, '$2');
  return value;
}

function setValue(text, key, value) {
  if (lineRe(key).test(text)) return text.replace(lineRe(key), `${key}=${value}`);
  return `${text.replace(/\s*$/, '')}\n${key}=${value}\n`;
}

function mergeOrigins(current) {
  const list = current ? current.split(',').map((s) => s.trim()).filter(Boolean) : [...DEFAULT_ORIGINS];
  const added = [LOCAL_ORIGIN, PUBLIC_ORIGIN].filter((o) => !list.includes(o));
  return { value: [...list, ...added].join(','), added };
}

// ── 入力（合言葉・キーは画面に出さない）──
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
let muted = false;
const writeOut = rl._writeToOutput.bind(rl);
rl._writeToOutput = (s) => { if (!muted) writeOut(s); };

function ask(prompt) {
  return new Promise((resolve) => rl.question(prompt, (a) => resolve(a.trim())));
}

function askHidden(prompt, envName) {
  if (!process.stdin.isTTY && process.env[envName]) return Promise.resolve(process.env[envName].trim());
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    muted = true;
    rl.question('', (a) => { muted = false; process.stdout.write('\n'); resolve(a.trim()); });
  });
}

function git(dir, args) {
  // GIT_TERMINAL_PROMPT=0: 認証を求められたら止まらずに失敗させる（pull の失敗は警告だけで続ける）
  return execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).trim();
}

function fail(msg) {
  console.log(`\n✗ ${msg}`);
  rl.close();
  process.exit(1);
}

// ── 本体 ──
console.log('MA Compass 連携の設定を、手元の 4 ツールの .env に書き込みます。');
console.log(`ツールの場所: ${BASE}\n`);

for (const t of TOOLS) {
  t.path = join(BASE, t.dir);
  if (!existsSync(t.path)) fail(`${t.label} のフォルダが見つかりません: ${t.path}`);
  let remote = '';
  try { remote = git(t.path, ['remote', 'get-url', 'origin']); } catch { /* git でない */ }
  const name = remote.replace(/\.git$/, '').split('/').pop().toLowerCase();
  if (name !== t.repo) fail(`${t.path} は ${t.label} ではないようです（GitHub 上の名前: ${name || '不明'}）。`);
  t.envPath = join(t.path, '.env');
  t.text = existsSync(t.envPath) ? readFileSync(t.envPath, 'utf8') : null;
  console.log(`  ✓ ${t.label}（${t.dir}）${t.text === null ? ' ※ .env がないため新しく作ります' : ''}`);
}

const seo = TOOLS.find((t) => t.secretsKey);
const seoHasKey = !!(seo.text && getValue(seo.text, 'SECRETS_KEY'));

const ok = await ask('\nこの 4 つの .env を書き換えます。よろしいですか？（y と入力して Enter）: ');
if (ok.toLowerCase() !== 'y') fail('中止しました。何も変更していません。');

console.log('\n控えておいた文字列を貼り付けて Enter を押してください（画面には表示されません）。');
const token = await askHidden('  合言葉: ', 'MA_ENV_BRIDGE_TOKEN');
if (token.length < 20) fail('合言葉が短すぎます（控えた文字列をそのまま貼り付けてください）。何も変更していません。');
let secretsKey = '';
if (!seoHasKey) {
  secretsKey = await askHidden('  暗号化キー: ', 'MA_ENV_SECRETS_KEY');
  if (secretsKey.length < 20) fail('暗号化キーが短すぎます。何も変更していません。');
  if (secretsKey === token) fail('合言葉と暗号化キーが同じです。別々の文字列を使ってください。何も変更していません。');
}
rl.close();

// 最新の main を取り込む（失敗しても設定は続ける）
console.log('\n最新版を取り込んでいます…');
for (const t of TOOLS) {
  try {
    const branch = git(t.path, ['branch', '--show-current']);
    const out = git(t.path, ['pull', '--ff-only']);
    const note = branch === 'main' ? '' : `（ブランチ ${branch}。main ではありません）`;
    console.log(`  ✓ ${t.label}: ${/Already up to date|すでに最新/.test(out) ? '最新です' : '更新しました'}${note}`);
  } catch {
    console.log(`  △ ${t.label}: 自動で更新できませんでした（手元に変更がある可能性）。設定はこのまま続けます`);
  }
}

const backupDir = join(homedir(), '.ma-compass-env-backup');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '');

console.log('\n.env を書き換えています…');
for (const t of TOOLS) {
  const notes = [];
  let text = t.text;
  if (text === null) {
    // .env.example の仮の値（xxxx など）は持ち込まず、連携の設定だけで作る
    text = '# MA Compass 連携（scripts/setup-local-env.mjs が作成）\n';
    notes.push('.env を新規作成');
  } else {
    mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    const backup = join(backupDir, `${t.repo}-${stamp}.env`);
    copyFileSync(t.envPath, backup);
    chmodSync(backup, 0o600);
  }

  const origins = mergeOrigins(getValue(text, t.originsKey));
  text = setValue(text, t.originsKey, origins.value);
  notes.push(origins.added.length ? `${t.originsKey} に ${origins.added.join(', ')} を追加` : `${t.originsKey} は設定済み`);

  text = setValue(text, 'BRIDGE_TOKEN', token);
  notes.push('BRIDGE_TOKEN（合言葉）を設定');

  if (t.secretsKey) {
    if (seoHasKey) notes.push('SECRETS_KEY は既にあるため変更なし');
    else { text = setValue(text, 'SECRETS_KEY', secretsKey); notes.push('SECRETS_KEY（暗号化キー）を設定'); }
  }
  if (t.port) {
    const before = getValue(text, 'PORT');
    text = setValue(text, 'PORT', t.port);
    notes.push(before === t.port ? `PORT は ${t.port} のまま` : `PORT を ${t.port} に変更`);
  }

  writeFileSync(t.envPath, text, { mode: 0o600 });
  console.log(`  ✓ ${t.label}: ${notes.join('、')}`);
}

if (TOOLS.some((t) => t.text !== null)) console.log(`\n書き換える前の .env は ${backupDir} に控えました。`);
console.log('\n完了しました。4 つのツールをいったん止めて、起動し直してください（.env は起動時にだけ読まれます）。');
if (seoHasKey) console.log('※ seo-dashboard には暗号化キーが既にあったため、そのまま使っています。今回作った暗号化キーは使いません。');
