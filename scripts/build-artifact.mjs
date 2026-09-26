// Turns the single-file demo build into an HTML fragment for publishing as a shareable page.
// The host wraps the fragment in its own document, so the outer html/head/body tags are removed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist-demo/index.html', 'utf8');
const title = html.match(/<title>[\s\S]*?<\/title>/)?.[0] ?? '<title>MA Compass</title>';
const fragment = html
  .replace(/<!doctype html>/i, '')
  .replace(/<\/?html[^>]*>/gi, '')
  .replace(/<\/?head>/gi, '')
  .replace(/<\/?body>/gi, '')
  .replace(/<meta charset[^>]*>/i, '')
  .replace(/<meta name="viewport"[^>]*>/i, '')
  .replace(/<title>[\s\S]*?<\/title>/, '')
  .trim();

mkdirSync('artifact', { recursive: true });
writeFileSync('artifact/ma-compass.html', `${title}\n${fragment}\n`);
console.log(`artifact/ma-compass.html (${(fragment.length / 1024).toFixed(0)} KB)`);
