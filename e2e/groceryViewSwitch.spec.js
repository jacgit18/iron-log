import { test, expect } from './fixtures.js';

// The Groceries view switch (Shopping, Bought, Inventory) is the SubNav pill row (brief subnav-pill-row-and-wording-table): the selected view is the accent-filled pill with aria-pressed,
// the others are outlined. The Daily tabs above keep the shared .seg filled pill (hands off).
const look = (page, sel) => page.locator(sel).evaluate(el => {
  const s = getComputedStyle(el); const r = el.getBoundingClientRect();
  return { fill: s.backgroundColor, border: s.borderTopColor, pressed: el.getAttribute('aria-pressed'), h: Math.round(r.height), w: Math.round(r.width) };
});

test('the selected view is the filled pill, the others are not, and every one is still 44px tall', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#tab-daily');
  await page.click('#daily-grocery');
  const on = await look(page, '#groc-view-inventory'); // Inventory is the default view
  const off = await look(page, '#groc-view-shopping');
  expect(on.pressed).toBe('true');
  expect(off.pressed).toBe('false');
  expect(on.fill).not.toBe(off.fill);
  expect(on.border).not.toBe(off.border);
  for (const id of ['#groc-view-shopping', '#groc-view-bought', '#groc-view-inventory']) expect((await look(page, id)).h).toBeGreaterThanOrEqual(44);
  // The fill follows the selection.
  await page.click('#groc-view-bought');
  expect((await look(page, '#groc-view-bought')).fill).toBe(on.fill);
  expect((await look(page, '#groc-view-inventory')).fill).toBe(off.fill);
});

test('at 320px wide and 200% text the views scroll inside their row and the page does not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.addStyleTag({ content: 'html{font-size:200%!important}' });
  await page.click('#tab-daily');
  await page.click('#daily-grocery');
  const m = await page.evaluate(() => { const row = document.querySelector('[aria-label="Grocery view"]'); return { scrollW: document.documentElement.scrollWidth, W: innerWidth, rowScrolls: row.scrollWidth > row.clientWidth, rowRight: Math.round(row.getBoundingClientRect().right) }; });
  expect(m.scrollW).toBeLessThanOrEqual(m.W);
  expect(m.rowRight).toBeLessThanOrEqual(m.W);
  expect(m.rowScrolls).toBe(true);
});

test('the Daily tabs above keep the filled pill', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#tab-daily');
  await page.click('#daily-grocery');
  const pill = await look(page, '#daily-grocery');
  expect(pill.fill).not.toBe('rgba(0, 0, 0, 0)');
});
