#!/usr/bin/env node
// Lighthouse on the production build, mobile and desktop, first visit (a fresh profile each run, service worker not involved).
//   node scripts/lighthouse.mjs                 build, serve, audit, print the scores
//   node scripts/lighthouse.mjs --check         the same, and exit 1 if a score is under the floors below (a regression)
//   node scripts/lighthouse.mjs --url=URL       audit a running site (the live app, a preview) instead; no build
//   node scripts/lighthouse.mjs --tab=daily     audit ?open=<tab> (board, daily, progress, program, settings)
// Scores wobble by about 3 points on a busy machine: repeat (--runs=3 takes the median) before calling a change a regression or a fix.
// Needs Playwright's Chromium (npx playwright install chromium); Lighthouse itself comes from npx.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.find(a => a.startsWith(`--${name}=`)) || '').slice(name.length + 3) || fallback;
const runs = Number(opt('runs', '1'));
const tab = opt('tab', '');
const port = 4175;
// Floors: the lowest scores that count as "not worse than now". The goal is 100 everywhere; raise a floor when a change earns it.
const FLOORS = { mobile: { performance: 88, accessibility: 100, 'best-practices': 100, seo: 100 }, desktop: { performance: 97, accessibility: 100, 'best-practices': 100, seo: 100 } };
const MAX_CLS = 0.01;

const chrome = (() => {
  const root = join(homedir(), '.cache', 'ms-playwright');
  const dir = existsSync(root) ? readdirSync(root).filter(d => d.startsWith('chromium-')).sort().pop() : undefined;
  const sub = dir && ['chrome-linux64', 'chrome-linux', 'chrome-mac', 'chrome-win'].find(s => existsSync(join(root, dir, s)));
  return process.env.CHROME_PATH || (dir && sub ? join(root, dir, sub, sub.includes('win') ? 'chrome.exe' : 'chrome') : undefined);
})();
if (!chrome) { console.error('No Chromium found. Run: npx playwright install chromium (or set CHROME_PATH)'); process.exit(2); }

let server;
let base = opt('url', '');
if (!base) {
  if (spawnSync('npm', ['run', 'build'], { stdio: 'inherit' }).status !== 0) process.exit(2);
  server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
  base = `http://127.0.0.1:${port}/`;
  await new Promise(r => setTimeout(r, 3000));
}
const url = tab ? `${base}${base.includes('?') ? '&' : '?'}open=${tab}` : base;
const out = mkdtempSync(join(tmpdir(), 'lighthouse-'));
const median = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

let failed = false;
for (const form of ['mobile', 'desktop']) {
  const results = [];
  for (let i = 0; i < runs; i++) {
    const file = join(out, `${form}-${i}.json`);
    const r = spawnSync('npx', ['-y', 'lighthouse', url, ...(form === 'desktop' ? ['--preset=desktop'] : ['--form-factor=mobile']), '--output=json', `--output-path=${file}`, '--quiet', '--chrome-flags=--headless=new --no-sandbox'], { env: { ...process.env, CHROME_PATH: chrome }, stdio: 'ignore' });
    if (r.status !== 0 || !existsSync(file)) { console.error(`Lighthouse failed (${form}).`); failed = true; continue; }
    results.push(JSON.parse(readFileSync(file, 'utf8')));
  }
  if (!results.length) continue;
  const score = k => Math.round(100 * median(results.map(j => j.categories[k]?.score ?? 0)));
  const metric = id => median(results.map(j => j.audits[id].numericValue));
  const cls = metric('cumulative-layout-shift');
  console.log(`\n${form} (${url}, median of ${results.length})`);
  const scores = Object.fromEntries(['performance', 'accessibility', 'best-practices', 'seo'].map(k => [k, score(k)]));
  console.log('  ' + Object.entries(scores).map(([k, v]) => `${k} ${v}`).join('  '));
  console.log(`  FCP ${(metric('first-contentful-paint') / 1000).toFixed(1)} s  LCP ${(metric('largest-contentful-paint') / 1000).toFixed(1)} s  TBT ${Math.round(metric('total-blocking-time'))} ms  CLS ${cls.toFixed(3)}`);
  const failing = new Set(results.flatMap(j => Object.values(j.audits).filter(a => a.score !== null && a.score < 1 && a.scoreDisplayMode === 'binary').map(a => a.id)));
  if (failing.size) console.log(`  failing audits: ${[...failing].join(', ')}`);
  for (const [k, floor] of Object.entries(FLOORS[form])) if (scores[k] < floor) { console.log(`  UNDER FLOOR: ${k} ${scores[k]} < ${floor}`); failed = true; }
  if (cls > MAX_CLS) { console.log(`  UNDER FLOOR: CLS ${cls.toFixed(3)} > ${MAX_CLS}`); failed = true; }
}
server?.kill();
process.exit(args.includes('--check') && failed ? 1 : 0);
