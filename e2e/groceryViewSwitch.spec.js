import { test, expect } from './fixtures.js';

// The Groceries view switch (Shopping, Bought, Inventory) is the second level under the Daily tabs: the selected view has an accent underline and no
// fill, so it does not read as a second copy of the filled-pill Daily tabs. The shared .seg look (filled pill) is what the Daily tabs keep.
const look = (page, sel) => page.locator(sel).evaluate(el => {
  const s = getComputedStyle(el); const r = el.getBoundingClientRect();
  return { fill: s.backgroundColor, underline: s.borderBottomColor, underlineWidth: s.borderBottomWidth, h: Math.round(r.height), w: Math.round(r.width) };
});

test('the selected view has an underline and no fill, the others have neither, and every one is still 44px tall', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#tab-daily');
  await page.click('#daily-grocery');
  const on = await look(page, '#groc-view-inventory'); // Inventory is the default view
  const off = await look(page, '#groc-view-shopping');
  expect(on.fill).toBe('rgba(0, 0, 0, 0)');
  expect(on.underlineWidth).toBe('3px');
  expect(on.underline).not.toBe('rgba(0, 0, 0, 0)');
  expect(off.fill).toBe('rgba(0, 0, 0, 0)');
  expect(off.underline).toBe('rgba(0, 0, 0, 0)');
  for (const id of ['#groc-view-shopping', '#groc-view-bought', '#groc-view-inventory']) expect((await look(page, id)).h).toBeGreaterThanOrEqual(44);
  // The underline follows the selection.
  await page.click('#groc-view-bought');
  expect((await look(page, '#groc-view-bought')).underline).toBe(on.underline);
  expect((await look(page, '#groc-view-inventory')).underline).toBe('rgba(0, 0, 0, 0)');
});

test('at 320px wide and 200% text the three views wrap to a second row instead of making the page scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.addStyleTag({ content: 'html{font-size:200%!important}' });
  await page.click('#tab-daily');
  await page.click('#daily-grocery');
  const m = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, W: innerWidth, rights: ['#groc-view-shopping', '#groc-view-bought', '#groc-view-inventory'].map(s => Math.round(document.querySelector(s).getBoundingClientRect().right)) }));
  expect(m.scrollW).toBeLessThanOrEqual(m.W);
  for (const r of m.rights) expect(r).toBeLessThanOrEqual(m.W);
});

test('the Daily tabs above keep the filled pill', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#tab-daily');
  await page.click('#daily-grocery');
  const pill = await look(page, '#daily-grocery');
  expect(pill.fill).not.toBe('rgba(0, 0, 0, 0)');
});
