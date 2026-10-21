#!/usr/bin/env node
// Lighthouse on the production build, mobile and desktop, first visit (a fresh profile each run, service worker not involved).
//   node scripts/lighthouse.mjs                 build, serve, audit, print the scores
//   node scripts/lighthouse.mjs --check         the same, and exit 1 if a score is under the floors below (a regression)
//   node scripts/lighthouse.mjs --url=URL       audit a running site (the live app, a preview) instead; no build
//   node scripts/lighthouse.mjs --tab=daily     audit ?open=<tab> (board, daily, progress, program, settings)
// Scores wobble by about 3 points on a busy machine: repeat (--runs=3 takes the median; with an even count such as --runs=2 the worse of the two middle values is reported, so use 3 or more for a fair number) before calling a change a regression or a fix.
// Needs Playwright's Chromium (npx playwright install chromium; found through Playwright itself, so it works on Linux, macOS and Windows, or set CHROME_PATH).
// Lighthouse runs from npx at the pinned version below: its scoring changes between majors, so raise LIGHTHOUSE together with the floors, on purpose.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.find(a => a.startsWith(`--${name}=`)) || '').slice(name.length + 3) || fallback;
const runs = Number(opt('runs', '1'));
if (!Number.isInteger(runs) || runs < 1) { console.error('--runs must be a whole number, 1 or more'); process.exit(2); }
const LIGHTHOUSE = 'lighthouse@13.5.0';
const shell = process.platform === 'win32'; // npx and npm are .cmd files there
const tab = opt('tab', '');
// Floors: the lowest scores that count as "not worse than now". The goal is 100 everywhere; raise a floor when a change earns it.
const FLOORS = { mobile: { performance: 88, accessibility: 100, 'best-practices': 100, seo: 100 }, desktop: { performance: 97, accessibility: 100, 'best-practices': 100, seo: 100 } };
const MAX_CLS = 0.01;

const chrome = process.env.CHROME_PATH || chromium.executablePath();
if (!chrome || !existsSync(chrome)) { console.error('No Chromium found. Run: npx playwright install chromium (or set CHROME_PATH)'); process.exit(2); }

let server;
const stop = () => { if (server && server.exitCode === null) server.kill(); };
process.on('exit', stop);
let base = opt('url', '');
if (!base) {
  if (spawnSync('npm', ['run', 'build'], { stdio: 'inherit', shell }).status !== 0) process.exit(2);
  // A port nobody is using, so a server left over from an earlier run can never be audited in place of this build (--strictPort: if it is taken
  // in the meantime, vite exits and we stop).
  const port = await new Promise(r => { const t = createServer(); t.listen(0, '127.0.0.1', () => { const { port: p } = t.address(); t.close(() => r(p)); }); });
  // Vite is run with node directly, not through npx or a shell: killing a wrapper would leave the real server running.
  server = spawn(process.execPath, [join('node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: ['ignore', 'ignore', 'inherit'] });
  base = `http://127.0.0.1:${port}/`;
  const up = async () => { try { return (await fetch(base)).ok; } catch { return false; } };
  const deadline = Date.now() + 30_000;
  while (!(await up())) {
    if (server.exitCode !== null) { console.error(`The preview server stopped (is port ${port} already in use?). Nothing was audited.`); process.exit(2); }
    if (Date.now() > deadline) { console.error('The preview server did not answer within 30 s.'); process.exit(2); }
    await new Promise(r => setTimeout(r, 250));
  }
}
const url = tab ? `${base}${base.includes('?') ? '&' : '?'}open=${tab}` : base;
const out = mkdtempSync(join(tmpdir(), 'lighthouse-'));
// The median; for an even run count there are two middle values and the WORSE one is reported (--runs=2 never flatters a change):
// the lower for a score (higher is better), the higher for a time or shift (lower is better).
const median = (xs, lowerIsWorse = false) => { const s = [...xs].sort((a, b) => a - b); return s[lowerIsWorse ? Math.ceil(s.length / 2) - 1 : Math.floor(s.length / 2)]; };

let failed = false;
for (const form of ['mobile', 'desktop']) {
  const results = [];
  for (let i = 0; i < runs; i++) {
    const file = join(out, `${form}-${i}.json`);
    const r = spawnSync('npx', ['-y', LIGHTHOUSE, url, ...(form === 'desktop' ? ['--preset=desktop'] : ['--form-factor=mobile']), '--output=json', `--output-path=${file}`, '--quiet', '--chrome-flags=--headless=new --no-sandbox'], { env: { ...process.env, CHROME_PATH: chrome }, stdio: 'ignore', shell });
    if (r.status !== 0 || !existsSync(file)) { console.error(`Lighthouse failed (${form}).`); failed = true; continue; }
    results.push(JSON.parse(readFileSync(file, 'utf8')));
  }
  if (!results.length) { failed = true; continue; } // nothing audited is never a pass
  const score = k => Math.round(100 * median(results.map(j => j.categories[k]?.score ?? 0), true));
  const metric = id => median(results.map(j => j.audits[id].numericValue));
  const cls = metric('cumulative-layout-shift');
  console.log(`\n${form} (${url}, median of ${results.length}${results.length % 2 ? '' : ', worse of the middle two'})`);
  const scores = Object.fromEntries(['performance', 'accessibility', 'best-practices', 'seo'].map(k => [k, score(k)]));
  console.log('  ' + Object.entries(scores).map(([k, v]) => `${k} ${v}`).join('  '));
  console.log(`  FCP ${(metric('first-contentful-paint') / 1000).toFixed(1)} s  LCP ${(metric('largest-contentful-paint') / 1000).toFixed(1)} s  TBT ${Math.round(metric('total-blocking-time'))} ms  CLS ${cls.toFixed(3)}`);
  const failing = new Set(results.flatMap(j => Object.values(j.audits).filter(a => a.score !== null && a.score < 1 && a.scoreDisplayMode === 'binary').map(a => a.id)));
  if (failing.size) console.log(`  failing audits: ${[...failing].join(', ')}`);
  for (const [k, floor] of Object.entries(FLOORS[form])) if (scores[k] < floor) { console.log(`  UNDER FLOOR: ${k} ${scores[k]} < ${floor}`); failed = true; }
  if (cls > MAX_CLS) { console.log(`  UNDER FLOOR: CLS ${cls.toFixed(3)} > ${MAX_CLS}`); failed = true; }
}
stop();
process.exit(args.includes('--check') && failed ? 1 : 0);
