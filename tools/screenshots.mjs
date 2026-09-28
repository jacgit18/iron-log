// Generates the README images in docs/images/ using sample data. Builds the app first.
// Usage: npm ci && npm i --no-save playwright && npx playwright install chromium && node tools/screenshots.mjs
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'docs', 'images');
const NOW = new Date('2026-09-24T18:30:00-04:00'); // a Thursday; week of Sun Sep 20
const DIST = join(ROOT, 'dist');
const TYPES = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.mjs':'text/javascript', '.svg':'image/svg+xml', '.png':'image/png', '.json':'application/json', '.webmanifest':'application/manifest+json', '.woff2':'font/woff2' };

execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });

// ---- static server: the built app, plus the repo's tools/, docs/ and public/ for the banner page ----
const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const dir = /^\/(tools|docs|public)\//.test(p) ? ROOT : DIST;
    const file = normalize(join(dir, p));
    if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ---- sample data (clearly fictional demo log) ----
const e = (d, ph, w, s, r, sec) => ({ d, ph, w, s, ...(sec ? { sec } : { r }) });
const logs = {
  hack:       [e('2026-08-27','hyp',250,4,15), e('2026-09-03','hyp',260,4,15), e('2026-09-10','hyp',270,4,15), e('2026-09-17','hyp',270,4,15)],
  hipthrust:  [e('2026-08-25','strength',300,4,6), e('2026-09-01','strength',310,4,6), e('2026-09-08','strength',315,4,6), e('2026-09-15','strength',320,4,6), e('2026-09-22','strength',320,4,6)],
  latpdbi:    [e('2026-09-07','hyp',40,4,15), e('2026-09-14','hyp',42.5,4,15), e('2026-09-21','hyp',45,4,12)],
  chestpress: [e('2026-08-24','strength',30,4,6), e('2026-09-07','strength',32.5,4,6), e('2026-09-15','hyp',25,4,15), e('2026-09-21','strength',35,4,6)],
  zercher:    [e('2026-09-07','strength',45,4,6), e('2026-09-14','strength',47.5,4,6), e('2026-09-21','strength',50,4,6)],
  legext:     [e('2026-09-01','iso',45,4,0,20), e('2026-09-08','iso',50,4,0,25), e('2026-09-15','iso',50,4,0,30)],
  farmers:    [e('2026-09-08','strength',35,4,6), e('2026-09-15','strength',40,4,6), e('2026-09-22','strength',40,4,6)],
  grip:       [e('2026-09-01','strength',180,4,6), e('2026-09-08','strength',190,4,6), e('2026-09-15','strength',200,4,6), e('2026-09-21','strength',200,4,6)],
  kbleg:      [e('2026-09-14','iso',15,3,0,15), e('2026-09-21','iso',15,3,0,20)],
  zottman:    [e('2026-09-07','hyp',12.5,3,15), e('2026-09-21','hyp',15,3,15)],
  innerthigh: [e('2026-09-14','strength',170,4,6), e('2026-09-21','strength',180,4,6)],
};
const COUNTS = { A:[9,8,9,8,10,6], B:[11,8,8,9,9,6] };
const doneDays = (prog, fullDays, partial = {}) => {
  const done = {};
  fullDays.forEach(d => { for (let s = 1; s <= COUNTS[prog][d-1]; s++) done[`${prog}-d${d}s${s}`] = true; });
  Object.entries(partial).forEach(([d, n]) => { for (let s = 1; s <= n; s++) done[`${prog}-d${d}s${s}`] = true; });
  return done;
};
const weeks = {
  '2026-09-20': { prog:null, done: doneDays('B',[1],{2:4}), moved:{'B-d3s3':2}, ph:{}, warm:{1:{shadow:true,sled:true},2:{shadow:true}} },
  '2026-09-13': { done: doneDays('B',[1,2,3,4,5],{6:3}), moved:{} },
  '2026-09-06': { done: doneDays('B',[1,2,3,4]), moved:{} },
  '2026-08-30': { done: doneDays('A',[1,2,3,4,5,6]), moved:{} },
  '2026-08-23': { done: doneDays('A',[1,2,3],{4:5}), moved:{} },
  '2026-08-16': { done: doneDays('A',[1,2,3,4,5]), moved:{} },
};
const config = { mode:2, m2Even:'A', m3Start:1, m3First:'A', pct:{strength:85,iso:75,hyp:65,exp:45}, rxOverride:{}, rm:{}, phDef:{}, ex:{}, muscleMap:{}, rest:90 };
const seed = { 'ironlog:config/main': config, 'ironlog:hidetip': '1', 'ironlog:hidelocal': '1' };
Object.entries(logs).forEach(([k, v]) => seed[`ironlog:logs/${k}`] = { entries: v });
Object.entries(weeks).forEach(([k, v]) => seed[`ironlog:weeks/${k}`] = v);

const browser = await chromium.launch();
async function open({ width, height, dpr = 2, dark = false, mobile = false }) {
  // No service worker, so "Ready to work offline" never shows up in a screenshot.
  const ctx = await browser.newContext({ viewport:{ width, height }, deviceScaleFactor:dpr, colorScheme: dark ? 'dark' : 'light', isMobile:mobile, hasTouch:mobile, timezoneId:'America/New_York', serviceWorkers:'block' });
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, seed);
  const page = await ctx.newPage();
  await page.clock.install({ time: NOW });
  await page.goto(BASE + '/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(300);
  return { ctx, page };
}
const shot = (page, name, opts = {}) => page.screenshot({ path: join(OUT, name), ...opts });

await mkdir(OUT, { recursive: true });

// Desktop board, light and dark
for (const dark of [false, true]) {
  const { ctx, page } = await open({ width:1440, height:900, dpr:1.5, dark });
  await shot(page, dark ? 'board-dark.png' : 'board.png');
  await ctx.close();
}

// Phone: board, log sheet, hold timer
{
  const { ctx, page } = await open({ width:390, height:844, dpr:2, mobile:true });
  await shot(page, 'mobile-board.png');
  await page.click('#log-B-d2s5-0');
  await page.waitForTimeout(200);
  await shot(page, 'mobile-log.png');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.click('#daytab-3');
  await page.click('#hold-B-d3s6-0');
  await page.clock.runFor(9000);
  await shot(page, 'mobile-timer.png');
  await ctx.close();
}

// Muscles, progress, program editor (desktop)
{
  const { ctx, page } = await open({ width:1440, height:1000, dpr:1.5 });
  await page.click('#tab-body'); await page.waitForTimeout(200);
  await shot(page, 'muscles.png');
  await page.getByRole('button', { name: /^Hamstrings/ }).click(); await page.waitForTimeout(200);
  await shot(page, 'muscles-detail.png');
  await page.click('#tab-progress'); await page.waitForTimeout(400);
  await shot(page, 'progress.png');
  await page.click('#tab-program'); await page.waitForTimeout(200);
  await shot(page, 'editor.png');
  await ctx.close();
}

// Banner (uses mobile-board.png, so it runs last)
{
  const ctx = await browser.newContext({ viewport:{ width:1280, height:640 }, deviceScaleFactor:2, serviceWorkers:'block' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/tools/banner.html');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await shot(page, 'banner.png');
  await ctx.close();
}

await browser.close();
server.close();
console.log('Screenshots written to docs/images/');
