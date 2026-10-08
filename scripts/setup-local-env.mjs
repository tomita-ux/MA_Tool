#!/usr/bin/env node
// Sets up the .env of the four local tools so the public MA Compass can read their data
// (docs/06-deployment.md §8.9).
//
//   node setup-local-env.mjs [folder]
//
// The tools are looked for under the folder (default: here), then under the home folder, by their
// git remote, package name or folder name — so renamed or scattered folders are found too.
// - creates .env (with only these keys) when there is none — copying .env.example would bring its
//   placeholder values and change how a tool that runs fine today behaves
// - one shared BRIDGE_TOKEN (reuses an existing one), SECRETS_KEY for seo-dashboard (kept if set)
// - adds MA Compass to each tool's allowed origins, sns-dashboard on port 3003
// Existing values are kept; only these keys are added or changed. Safe to run again.

import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const ORIGINS = ['http://localhost:5173', 'https://ma-compass.pages.dev'];

const TOOLS = [
  { name: 'ads-bi-dashboard', repo: 'ads-bi-dashboard', pkg: 'ads-bi-dashboard', origins: 'CORS_ALLOWED_ORIGINS' },
  { name: 'GA-Dashboard', repo: 'ga-dashboard', pkg: 'ga4-analytics-dashboard', origins: 'BRIDGE_ALLOWED_ORIGINS' },
  { name: 'seo-dashboard', repo: 'seo-dashboard', pkg: 'seo-dashboard', origins: 'BRIDGE_ALLOWED_ORIGINS', secretsKey: true },
  { name: 'sns-dashboard', repo: 'sns-dashboard', pkg: 'sns-dashboard', origins: 'CORS_ALLOWED_ORIGINS', port: '3003' },
];

const root = resolve(process.argv[2] ?? '.');
const newSecret = () => randomBytes(32).toString('base64');
const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const read = (f) => {
  try {
    return readFileSync(f, 'utf8');
  } catch {
    return '';
  }
};

/** Which tool this folder is: by git remote, package.json name, then folder name. */
function whichTool(dir, base) {
  const pkgText = read(join(dir, 'package.json'));
  if (!pkgText) return undefined;
  const remotes = [...read(join(dir, '.git', 'config')).matchAll(/^\s*url\s*=\s*(\S+)/gm)].map((m) => m[1].toLowerCase());
  let pkg = '';
  try {
    pkg = JSON.parse(pkgText).name ?? '';
  } catch {}
  return (
    TOOLS.find((t) => remotes.some((u) => u.replace(/\.git$/, '').endsWith('/' + t.repo))) ??
    TOOLS.find((t) => pkg === t.pkg) ??
    TOOLS.find((t) => squash(base).startsWith(squash(t.repo)))
  );
}

const SKIP = new Set(['node_modules', 'Library', 'Applications', 'Pictures', 'Movies', 'Music', 'Public', 'dist', 'build', 'vendor', 'venv', '__pycache__']);

/** Walk a few levels down from `start`, collecting tool folders (not descending into them). */
function search(start, hits, maxDepth = 5, budget = { left: 30000 }) {
  const queue = [[start, 0]];
  while (queue.length && budget.left-- > 0) {
    const [dir, depth] = queue.shift();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || SKIP.has(e.name)) continue;
      const full = join(dir, e.name);
      const tool = whichTool(full, e.name);
      if (tool) {
        if (!hits.some((h) => h.dir === full)) hits.push(candidate(tool, full, depth));
      } else if (depth < maxDepth) queue.push([full, depth + 1]);
    }
  }
}

const candidate = (tool, dir, depth) => ({ tool, dir, depth, hasEnv: existsSync(join(dir, '.env')), hasGit: existsSync(join(dir, '.git')) });

/** The best candidate per tool: the copy in use (has .env, is a git clone), then under the given folder, then the shallowest. */
function findTools() {
  const hits = [];
  const self = whichTool(root, root.split(/[\\/]/).pop() ?? '');
  if (self) hits.push(candidate(self, root, 0));
  search(root, hits);
  hits.forEach((h) => (h.here ??= true));
  const home = homedir();
  if (TOOLS.some((t) => !hits.some((h) => h.tool === t)) && home && resolve(home) !== root) search(home, hits);
  return TOOLS.map((t) => {
    const cands = hits
      .filter((h) => h.tool === t)
      .sort((a, b) => Number(b.hasEnv) - Number(a.hasEnv) || Number(b.hasGit) - Number(a.hasGit) || Number(!!b.here) - Number(!!a.here) || a.depth - b.depth);
    return { ...t, dir: cands[0]?.dir, others: cands.slice(1).map((c) => c.dir) };
  });
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

console.log('\nツールのフォルダを探しています…');
const found = findTools();
const missing = found.filter((t) => !t.dir);
if (missing.length === TOOLS.length) {
  const where = resolve(homedir()) === root ? root : `${root} と ${homedir()}`;
  console.error(`\n✗ ツールのフォルダが見つかりませんでした（探した場所：${where} の下）。`);
  console.error('  ads-bi-dashboard などのフォルダがある場所を指定して実行してください：');
  console.error('  node setup-local-env.mjs 場所\n');
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

console.log('');
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
  console.log(`      ${e.dir}`);
  for (const o of e.others) console.log(`      （ほかにも見つかったが使わなかったフォルダ：${o}）`);
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
