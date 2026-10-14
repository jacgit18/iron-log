import { readFileSync, writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// The other specs run with service workers blocked (playwright.config.js), so nothing else touches src/sw.ts. These use the real built
// worker: it takes over and the app opens offline, and the update handshake still works. The push handler is covered by
// src/swPush.test.ts; headless Chromium here refuses notification permission, so a real notification needs a device (ADR 044, PR 5).
test.use({ serviceWorkers: 'allow' });
test.describe.configure({ mode: 'serial' }); // one test changes the served worker file

async function controlled(page) {
  await page.addInitScript(() => { localStorage.setItem('ironlog:hidetip', '1'); localStorage.setItem('ironlog:hidelocal', '1'); });
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // the first load is not controlled; the next one is
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

test('the worker takes over, precaches the app, and the app opens offline', async ({ page, context }) => {
  await controlled(page);
  const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async k => (await (await caches.open(k)).keys()).length))).reduce((a, b) => a + b, 0));
  expect(cached).toBeGreaterThan(20);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: /^Workout/ }).first()).toBeVisible();
  await context.setOffline(false);
});

test('a new worker waits until the page sends SKIP_WAITING, then takes over', async ({ page }) => {
  await controlled(page);
  // Change the worker file the preview server serves, so the browser finds an update and installs it next to the one in control.
  // (Playwright cannot rewrite a worker script's request, so the built file is edited on disk and put back afterwards.)
  const file = 'dist/sw.js';
  const original = readFileSync(file, 'utf8');
  try {
    writeFileSync(file, `${original}\n// changed ${Date.now()}`);
    await checkWaiting(page);
  } finally {
    writeFileSync(file, original);
  }
});

async function checkWaiting(page) {
  const waiting = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    await reg.update();
    await new Promise(done => {
      const w = reg.installing ?? reg.waiting;
      if (!w || w.state === 'installed') return done();
      w.addEventListener('statechange', () => { if (w.state === 'installed') done(); });
    });
    return { waiting: !!reg.waiting };
  });
  expect(waiting.waiting).toBe(true); // installed, but not in control: it does not skip waiting by itself (registerType 'prompt', ADR 018)
  const stillOld = await page.evaluate(async () => { await new Promise(r => setTimeout(r, 500)); const reg = await navigator.serviceWorker.ready; return !!reg.waiting; });
  expect(stillOld).toBe(true);
  const took = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    const changed = new Promise(done => navigator.serviceWorker.addEventListener('controllerchange', () => done(true), { once: true }));
    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    return Promise.race([changed, new Promise(done => setTimeout(() => done(false), 5000))]);
  });
  expect(took).toBe(true);
}
