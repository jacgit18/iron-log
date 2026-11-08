import { test, expect } from './fixtures.js';

// Spending history inside Bought, and Shopping's buttons on a phone (brief groceries-spending-buttons-quick-add). A unit test cannot catch the inner switch and its address,
// the old #/daily/grocery/spend address, or the phone's button rows (their layout and what the More menu holds); the logic they show is covered by route.test.ts.
const CATALOGUE = {
  stores: ['Costco'],
  items: [
    { id: 'eggs', n: 'Eggs', store: 'Costco', qty: 1, cents: 1000, every: true, out: false },
    { id: 'oat', n: 'Oat milk', store: 'Costco', qty: 1, cents: 349, every: true, out: false },
  ],
  groups: [{ id: 'g1', n: 'Home', people: [{ id: 'sam', n: 'Sam' }], stores: ['Costco'] }],
};
const MONTH = { lines: { eggs: { got: true } }, pulled: [] };
const seed = page => page.evaluate(({ CATALOGUE, MONTH }) => {
  localStorage.setItem('ironlog:grocery/main', JSON.stringify(CATALOGUE));
  localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify(MONTH));
}, { CATALOGUE, MONTH });
const open = async page => { await seed(page); await page.reload(); await page.click('#tab-daily'); await page.click('#daily-grocery'); };
const hash = page => page.evaluate(() => location.hash);
const asAdmin = page => page.addInitScript(() => localStorage.setItem('ironlog:session/admin', 'true'));

test('Bought has This month and Spending history; each opens its own content and keeps its address through a reload', async ({ page }) => {
  await open(page);
  await expect(page.locator('#groc-view-spend')).toHaveCount(0);
  await page.click('#groc-view-bought');
  await expect(page.locator('#groc-bought-month')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#groc-summary')).toBeVisible(); // today's Bought page
  await expect(page.locator('#groc-spend-summary')).toHaveCount(0);
  await page.click('#groc-bought-history');
  await expect.poll(() => hash(page)).toBe('#/daily/grocery/bought/history');
  await expect(page.locator('#groc-sub')).toHaveText('What you spent by month and store.');
  await expect(page.locator('#groc-spend-summary')).toContainText('Average $5.00 a month over 1 month');
  await expect(page.getByRole('button', { name: '12 mo' })).toBeVisible();
  await expect(page.locator('#groc-month')).toHaveCount(0); // history ignores the month row
  await page.reload();
  await expect(page.locator('#groc-view-bought')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#groc-bought-history')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#groc-bought-month');
  await expect.poll(() => hash(page)).toBe('#/daily/grocery/bought');
  await expect(page.locator('#groc-summary')).toBeVisible();
});

test('the old Spending address opens Spending history', async ({ page }) => {
  await seed(page);
  await page.goto('/#/daily/grocery/spend');
  await page.reload();
  await expect(page.locator('#groc-bought-history')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#groc-spend-summary')).toBeVisible();
});

test('leaving Bought and coming back starts at This month', async ({ page }) => {
  await open(page);
  await page.click('#groc-view-bought'); await page.click('#groc-bought-history');
  await page.click('#groc-view-inventory');
  await page.click('#groc-view-bought');
  await expect(page.locator('#groc-bought-month')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => hash(page)).toBe('#/daily/grocery/bought');
});

test('at 320 px the three views, with their counts, stay on one row; at 200% text they may wrap but nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await open(page);
  const tops = () => page.evaluate(() => ['shopping', 'bought', 'inventory'].map(v => Math.round(document.querySelector(`#groc-view-${v}`).getBoundingClientRect().top)));
  expect(new Set(await tops()).size).toBe(1);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const m = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, W: document.documentElement.clientWidth }));
  expect(m.scrollW).toBeLessThanOrEqual(m.W);
});

test('on a phone Shopping has a full-width Scan receipt, a full-width search and Sort, Select items and More as equal 48 px buttons', async ({ page }) => {
  await asAdmin(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.click('#groc-view-shopping');
  const box = sel => page.locator(sel).first().boundingBox();
  const scan = await box('#groc-scan'); const search = await box('input[aria-label="Search groceries"]');
  const sort = await box('.gsortbtn'); const select = await box('#groc-select'); const more = await box('#groc-toolmore');
  expect(Math.round(scan.width)).toBe(Math.round(search.width));
  expect(scan.width).toBeGreaterThan(300);
  for (const b of [sort, select, more]) expect(Math.round(b.height)).toBe(48);
  expect(new Set([sort, select, more].map(b => Math.round(b.y))).size).toBe(1); // one row
  expect(Math.abs(sort.width - select.width)).toBeLessThan(2); expect(Math.abs(select.width - more.width)).toBeLessThan(2); // equal widths
  await expect(page.locator('#groc-scan-pick')).toBeHidden(); // Pick from photos is in More
  await page.click('#groc-toolmore');
  for (const id of ['#groc-scan-pick', '#groc-details-all', '#groc-skipall']) await expect(page.locator(id)).toBeVisible();
  await expect(page.locator('#groc-skipall')).toContainText('Skip the 1 left');
  await expect(page.locator('#groc-sub')).toBeVisible();
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(wide).toBe(false);
});

test('a phone without the receipt features sees search and Sort, Select items, More, and no receipt buttons', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.click('#groc-view-shopping');
  await expect(page.locator('#groc-scan')).toHaveCount(0);
  await page.click('#groc-toolmore');
  await expect(page.locator('#groc-scan-pick')).toHaveCount(0);
  await expect(page.locator('#groc-receipts')).toHaveCount(0);
  await expect(page.locator('#groc-details-all')).toBeVisible();
});

test('from 701 px the toolbar and receipt buttons stay where they were', async ({ page }) => {
  await asAdmin(page);
  await page.setViewportSize({ width: 701, height: 900 });
  await open(page);
  await page.click('#groc-view-shopping');
  await expect(page.locator('.gphone')).toHaveCount(0);
  await expect(page.locator('#groc-scan')).toBeVisible();
  await expect(page.locator('#groc-scan-pick')).toBeVisible();
  await expect(page.locator('.gbar .sortctl')).toBeVisible();
  await expect(page.locator('.gtools #groc-toolmore')).toBeVisible();
});
