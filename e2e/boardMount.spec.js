import { test, expect } from './fixtures.js';

// The Board draws a phone's selected day first and the other days one per idle slice (lib/boardMount.ts; the logic is unit tested there).
// These check the wiring: what is in the page at load, that a tapped day is never empty, and that a wide screen draws every column.
// Idle time is switched off for the first checks so "the other days have not drawn yet" is exact, not a race.
const noIdle = page => page.addInitScript(() => { window.requestIdleCallback = () => 0; window.cancelIdleCallback = () => {}; });
// The test program has six working days with cards (Day 7 has none), so Day 6 is the farthest day that can show cards.
const cardsIn = (page, selector) => page.locator(`${selector} article.card`).count();

test('a phone draws only the selected day at load', async ({ page }) => {
  await noIdle(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await expect(page.locator('.col.sel article.card').first()).toBeVisible();
  expect(await cardsIn(page, '.col:not(.sel)'), 'cards in the six other days').toBe(0);
  await expect(page.locator('.col')).toHaveCount(7); // every column and its header is still there
});

test('a phone: tapping a day shows its cards at once, before idle time has run', async ({ page }) => {
  await noIdle(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await expect(page.locator('.col.sel article.card').first()).toBeVisible();
  await page.locator('#daytab-6').click();
  await expect(page.locator('#col-6')).toHaveClass(/sel/);
  await expect(page.locator('#col-6 article.card').first()).toBeVisible();
  expect(await cardsIn(page, '#col-3'), 'Day 3 has not drawn (Day 1 was the first selected day, so it stays drawn)').toBe(0);
});

test('a phone: the other days fill in on their own after load', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await expect(page.locator('.col.sel article.card').first()).toBeVisible();
  await expect.poll(() => cardsIn(page, '.col:not(.sel)'), { timeout: 10_000, message: 'cards in the other days after idle' }).toBeGreaterThan(0);
  for (const d of [1, 2, 3, 4, 5, 6]) await expect.poll(() => cardsIn(page, `#col-${d}`), { timeout: 15_000, message: `cards in Day ${d} after idle` }).toBeGreaterThan(0);
});

test('a wide screen draws every day at load', async ({ page }) => {
  await noIdle(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await expect(page.locator('.col').first().locator('article.card').first()).toBeVisible();
  for (const d of [1, 2, 3, 4, 5, 6]) expect(await cardsIn(page, `#col-${d}`), `cards in Day ${d} on a wide screen`).toBeGreaterThan(0);
});
