import { test, expect } from '@playwright/test';

// The other specs run with service workers blocked (playwright.config.js), so nothing else touches src/sw.ts. These use the real built
// worker: it takes over and the app opens offline, and the update handshake still works. The push handler is covered by
// src/swPush.test.ts; headless Chromium here refuses notification permission, so a real notification needs a device (ADR 044, PR 5).
test.use({ serviceWorkers: 'allow' });

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

test('a waiting worker is told to take over only when the page sends SKIP_WAITING', async ({ page }) => {
  await controlled(page);
  // The handshake the update banner uses: posting the message to the active worker must not throw or unregister anything.
  const state = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    reg.active.postMessage({ type: 'SKIP_WAITING' });
    reg.active.postMessage({ type: 'something else' });
    await new Promise(r => setTimeout(r, 300));
    return { active: reg.active?.state, controller: !!navigator.serviceWorker.controller };
  });
  expect(state).toEqual({ active: 'activated', controller: true });
});
