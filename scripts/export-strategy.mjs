#!/usr/bin/env node
// Exports a strategy-agents project as JSON that MA Compass can import (連携ハブ → strategy-agents).
//
//   node scripts/export-strategy.mjs <strategy-agents>/projects/<id> [out.json]
//
// REPORT_DATA lives inside projects/<id>/dashboard.html and TACTICS_DATA in output/tactics-data.js.
// Both are JavaScript object literals, so the data script is evaluated in an isolated VM context
// (no require/process/fs). Page code that follows the data fails harmlessly and is ignored.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import vm from 'node:vm';

const [dir, out = 'strategy-plan.json'] = process.argv.slice(2);
if (!dir) {
  console.error('usage: node scripts/export-strategy.mjs <strategy-agents>/projects/<id> [out.json]');
  process.exit(1);
}

function extract(file, name) {
  if (!existsSync(file)) return undefined;
  const src = readFileSync(file, 'utf8');
  const start = src.indexOf(`const ${name} =`);
  if (start < 0) return undefined;
  const end = src.indexOf('</script>', start);
  const code = src.slice(start, end < 0 ? undefined : end).replace(`const ${name} =`, `globalThis.${name} =`);
  const ctx = vm.createContext({});
  try {
    vm.runInContext(code, ctx, { timeout: 2000 });
  } catch {
    // UI code after the data needs a browser; the data is already assigned.
  }
  return ctx[name];
}

/** Drops embedded images and long HTML appendices that MA Compass does not use. */
function slim(value) {
  if (Array.isArray(value)) return value.map(slim);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k, v]) => !['depth', 'heroImage', 'clientLogo', 'appendix', 'docs'].includes(k) && !(typeof v === 'string' && v.startsWith('data:')))
        .map(([k, v]) => [k, slim(v)]),
    );
  }
  return value;
}

const report = extract(join(dir, 'dashboard.html'), 'REPORT_DATA');
const tactics = extract(join(dir, 'output', 'tactics-data.js'), 'TACTICS_DATA');
if (!report && !tactics) {
  console.error('REPORT_DATA (dashboard.html) も TACTICS_DATA (output/tactics-data.js) も見つかりませんでした。');
  process.exit(1);
}
const payload = { source: 'strategy-agents', project: basename(dir), exportedAt: new Date().toISOString(), report: slim(report ?? {}), tactics: slim(tactics ?? {}) };
writeFileSync(out, JSON.stringify(payload, null, 2));
console.log(`${out} を書き出しました（report: ${report ? 'あり' : 'なし'} / tactics: ${tactics ? 'あり' : 'なし'}）`);
