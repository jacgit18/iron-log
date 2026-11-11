import { test, expect } from './fixtures.js';

// The SubNav pill row (brief subnav-pill-row-and-wording-table): Groceries' views and Bought tabs, and Settings' jump bar. Layout, scrolling and the selected state cannot be checked by a node test.
const pill = (page, sel) => page.locator(sel).evaluate(el => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return { fill: s.backgroundColor, radius: parseFloat(s.borderTopLeftRadius), h: Math.round(r.height) }; });

test('Groceries: the view switch and the Bought tabs are pills, one is pressed, and each is at least 44px tall', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#tab-daily');
  await page.click('#daily-grocery');
  await page.click('#groc-view-bought');
  for (const id of ['#groc-view-shopping', '#groc-view-bought', '#groc-view-inventory', '#groc-bought-month', '#groc-bought-history']) {
    const p = await pill(page, id);
    expect(p.h).toBeGreaterThanOrEqual(44);
    expect(p.radius).toBeGreaterThan(20); // a pill, not the square tab
  }
  await expect(page.locator('#groc-view-bought')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#groc-bought-month')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#groc-bought-history');
  await expect(page.locator('#groc-bought-history')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#groc-bought-month')).toHaveAttribute('aria-pressed', 'false');
});

for (const width of [375, 768, 1280, 1920]) test(`Settings: the jump row is the same pills, marks the group being read, and the page does not scroll sideways (${width} px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 });
  await page.goto('/#/settings');
  const nav = page.getByRole('navigation', { name: 'Jump to a settings group' });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Training' })).toHaveAttribute('aria-current', 'true');
  const p = await pill(page, '.sjump button >> nth=0');
  expect(p.h).toBeGreaterThanOrEqual(44);
  expect(p.radius).toBeGreaterThan(20);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  // The row sticks: after scrolling to the bottom it is still on screen.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(nav).toBeInViewport();
});
