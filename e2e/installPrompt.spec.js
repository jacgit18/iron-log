import { test, expect } from '@playwright/test';

// A frame or two for React to draw what the last event asked for, so a "not there" check cannot pass before it would have appeared.
const settle = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

// The install prompt (InstallHint.tsx): shown on any tab once the person is in, with a button that opens the browser's install dialog.
test.describe('install prompt', () => {
  test('offers Install on first visit, on any tab, and stays gone once dismissed', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('ironlog:hidetip', '1'); localStorage.setItem('ironlog:hidelocal', '1'); });
    await page.goto('/');
    await expect(page.locator('#tab-board')).toBeVisible();
    await settle(page);
    await expect(page.locator('#install-hint')).toHaveCount(0); // the browser has not said it can install
    await page.evaluate(() => {
      const e = new Event('beforeinstallprompt');
      Object.assign(e, { prompt: () => { (window).__prompted = true; return Promise.resolve(); }, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
      window.dispatchEvent(e);
    });
    const hint = page.locator('#install-hint');
    await expect(hint).toBeVisible();
    await page.locator('#tab-settings').click();
    await expect(hint).toBeVisible();
    await hint.getByRole('button', { name: 'Install' }).click();
    expect(await page.evaluate(() => (window).__prompted)).toBe(true);
    await expect(hint).toHaveCount(0);
    await page.reload();
    await expect(page.locator('#tab-board')).toBeVisible();
    await page.evaluate(() => { const e = new Event('beforeinstallprompt'); Object.assign(e, { prompt: () => Promise.resolve(), userChoice: Promise.resolve({ outcome: 'dismissed' }) }); window.dispatchEvent(e); });
    await settle(page);
    await expect(hint).toHaveCount(0);
  });
});
