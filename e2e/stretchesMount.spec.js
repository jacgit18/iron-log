import { test, expect } from './fixtures.js';

// The Stretches tab draws a phone's selected day first and the other days one per idle slice, like the Board (lib/boardMount.ts, e2e/boardMount.spec.js).
// Idle time is switched off for the first checks so "the other days have not drawn yet" is exact, not a race.
const noIdle = page => page.addInitScript(() => { window.requestIdleCallback = () => 0; window.cancelIdleCallback = () => {}; });
const cardsIn = (page, selector) => page.locator(`${selector} article.card`).count();
const openStretches = async (page, width) => {
  await page.setViewportSize({ width, height: 844 });
  await page.reload();
  await page.getByText('Stretches', { exact: true }).first().click();
  await expect(page.locator('.strroot')).toBeVisible();
};

test('a phone draws only the selected day of Stretches at load', async ({ page }) => {
  await noIdle(page);
  await openStretches(page, 390);
  await expect(page.locator('.strroot .col.sel article.card').first()).toBeVisible();
  expect(await cardsIn(page, '.strroot .col:not(.sel)'), 'cards in the six other days').toBe(0);
  await expect(page.locator('.strroot .col')).toHaveCount(7); // every column and its header is still there
});

test('a phone: tapping a Stretches day shows its cards at once, before idle time has run', async ({ page }) => {
  await noIdle(page);
  await openStretches(page, 390);
  const sel = await page.locator('.strroot .col.sel').getAttribute('id');
  const other = sel === 'scol-6' ? 'scol-3' : 'scol-6';
  await page.locator(`#sdaytab-${other.slice(5)}`).click();
  await expect(page.locator(`#${other}`)).toHaveClass(/sel/);
  await expect(page.locator(`#${other} article.card`).first()).toBeVisible();
});

test('a phone: the other Stretches days fill in on their own after load', async ({ page }) => {
  await openStretches(page, 390);
  await expect.poll(() => cardsIn(page, '.strroot .col:not(.sel)'), { timeout: 15_000, message: 'cards in the other days after idle' }).toBeGreaterThan(0);
  for (let d = 0; d < 7; d++) await expect.poll(() => cardsIn(page, `#scol-${d}`), { timeout: 15_000, message: `cards in day ${d} after idle` }).toBeGreaterThan(0);
});

test('a wide screen draws every Stretches day at load', async ({ page }) => {
  await noIdle(page);
  await openStretches(page, 1440);
  await expect(page.locator('.strroot .col').first().locator('article.card').first()).toBeVisible();
  for (let d = 0; d < 7; d++) expect(await cardsIn(page, `#scol-${d}`), `cards in day ${d} on a wide screen`).toBeGreaterThan(0);
});
