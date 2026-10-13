import { readFileSync, readdirSync } from 'node:fs';
import { test, expect } from './fixtures.js';

// Every tab except the Board is its own chunk, fetched when first opened (mobile item 9).
const TABS = [
  ['daily', 'Daily', /Medical|Supplements|Stretches|Grocery/i],
  ['progress', 'Progress', /Weekly history/],
  ['program', 'Program', /Program|Exercise/],
  ['settings', 'Settings', /Export all data/],
];

test('each lazy tab loads in its own chunk, and the Board did not need them', async ({ page }) => {
  // The fixture has already loaded the app and the Board: none of the tab chunks was requested.
  const chunks = [];
  page.on('request', r => { const m = /\/assets\/(Daily|Progress|Editor|Settings)-[\w-]+\.js$/.exec(r.url()); if (m) chunks.push(m[1]); });
  for (const [key, , text] of TABS) {
    await page.locator(`#tab-${key}`).click();
    await expect(page.locator('#view .view-loading')).toHaveCount(0);
    await expect(page.locator('#view')).toContainText(text);
    await expect(page.locator('#view .crash')).toHaveCount(0);
  }
  expect(chunks.sort()).toEqual(['Daily', 'Editor', 'Progress', 'Settings']);
});

test('a chunk that fails to load shows the error fallback, and Reload loads it', async ({ page }) => {
  await page.route(/\/assets\/Progress-[\w-]+\.js$/, route => route.abort());
  await page.locator('#tab-progress').click();
  const crash = page.locator('#view .crash');
  await expect(crash).toBeVisible();
  await expect(crash).toContainText('could not be downloaded');
  await expect(page.locator('#tab-board')).toBeVisible();
  await page.locator('#tab-settings').click(); // the other tabs still work
  await expect(page.locator('#view')).toContainText('Export all data');
  await page.locator('#tab-progress').click();
  await expect(crash).toBeVisible();
  await page.unroute(/\/assets\/Progress-[\w-]+\.js$/);
  await crash.getByRole('button', { name: 'Reload' }).click();
  await page.locator('#tab-progress').click();
  await expect(page.locator('#view')).toContainText('Weekly history');
});

test('the service worker precaches every built chunk, so the lazy tabs work offline', () => {
  const sw = readFileSync('dist/sw.js', 'utf8') + readdirSync('dist').filter(f => /^workbox-.*\.js$/.test(f)).map(f => readFileSync(`dist/${f}`, 'utf8')).join('');
  const built = readdirSync('dist/assets').filter(f => f.endsWith('.js'));
  expect(built.some(f => /^Daily-/.test(f))).toBe(true);
  for (const f of built) expect(sw, `assets/${f} missing from the precache`).toContain(`assets/${f}`);
});
