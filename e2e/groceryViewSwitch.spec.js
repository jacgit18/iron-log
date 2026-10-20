import { test, expect } from './fixtures.js';

// The Groceries view switch (To get, At home, Spending) is the second level under the Daily tabs: the selected view has an accent underline and no
// fill, so it does not read as a second copy of the filled-pill Daily tabs. The shared .seg look (filled pill) is what the Daily tabs keep.
const look = (page, sel) => page.locator(sel).evaluate(el => {
  const s = getComputedStyle(el); const r = el.getBoundingClientRect();
  return { fill: s.backgroundColor, underline: s.borderBottomColor, underlineWidth: s.borderBottomWidth, h: Math.round(r.height), w: Math.round(r.width) };
});

test('the selected view has an underline and no fill, the others have neither, and every one is still 44px tall', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#tab-daily');
  await page.click('#daily-grocery');
  const on = await look(page, '#groc-view-home'); // At home is the default view
  const off = await look(page, '#groc-view-get');
  expect(on.fill).toBe('rgba(0, 0, 0, 0)');
  expect(on.underlineWidth).toBe('3px');
  expect(on.underline).not.toBe('rgba(0, 0, 0, 0)');
  expect(off.fill).toBe('rgba(0, 0, 0, 0)');
  expect(off.underline).toBe('rgba(0, 0, 0, 0)');
  for (const id of ['#groc-view-get', '#groc-view-home', '#groc-view-spend']) expect((await look(page, id)).h).toBeGreaterThanOrEqual(44);
  // The underline follows the selection.
  await page.click('#groc-view-spend');
  expect((await look(page, '#groc-view-spend')).underline).toBe(on.underline);
  expect((await look(page, '#groc-view-home')).underline).toBe('rgba(0, 0, 0, 0)');
});

test('the Daily tabs above keep the filled pill', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#tab-daily');
  await page.click('#daily-grocery');
  const pill = await look(page, '#daily-grocery');
  expect(pill.fill).not.toBe('rgba(0, 0, 0, 0)');
});
