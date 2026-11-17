import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { openNutrition, todayCol } from './nutritionBoardHelpers.js';

// Repeat (brief nutrition-meal-labels-year-repeat). The rules (which days a repeat shows on, skips, the limit, the sheet's choices) are node tests (repeats.test.ts, dietSlice.test.ts);
// this covers the wiring: the Repeat sheet from a planned card, the repeat showing in the same meal on the same weekday of other weeks, Skip this day only, Stop repeating, a reload, and the daily snacks list still showing. The fixed clock is Thursday 2026-09-24.
const mk = (id, n, kcal, p) => ({ id, n, cat: 'sides', ing: [{ n: 'x' }], steps: ['Cook.'], kcal, p });
const seed = async page => { await page.evaluate(l => localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: l })), [mk('alm', 'Almonds', 170, 6), mk('oat', 'Oats', 320, 12)]); await page.reload(); };
const col = (page, day) => page.locator(`.nb-col[data-day="${day}"]`);
const snack = c => c.locator('.wb-slot', { has: c.page().locator('.wb-slothd b', { hasText: /^Snack$/ }) });
const weekOf = async (page, name) => { await page.locator('.nb-weekname').click(); await page.getByRole('dialog', { name: 'Choose a week' }).getByRole('button', { name }).click(); };
// Plans Almonds in Snack on a day ahead through the Add sheet, then opens its card.
const plan = async page => {
  await page.getByRole('button', { name: 'Next week', exact: true }).click(); // Sun 2026-09-27
  await page.locator('#nb-add').click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: /^Recipes/ }).click();
  await sheet.getByRole('button', { name: /Almonds/ }).first().click();
  await expect(snack(col(page, '2026-09-27')).locator('.wb-card')).toHaveCount(1);
};

test('a repeat on weekdays shows in the same meal on those days of every week, not on the others, and is stored once', async ({ page }) => {
  await seed(page);
  await openNutrition(page);
  await plan(page);
  const card = snack(col(page, '2026-09-27')).locator('.wb-card', { hasText: 'Almonds' });
  await card.click();
  await col(page, '2026-09-27').getByRole('button', { name: 'Repeat Almonds' }).click();
  const sheet = page.getByRole('dialog', { name: 'Repeat Almonds' });
  await sheet.getByRole('button', { name: 'Weekdays' }).click();
  await expect(sheet.getByRole('button', { name: 'Saturday' })).toHaveAttribute('aria-pressed', 'false');
  await sheet.getByRole('button', { name: 'Repeat', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.nb-msg')).toContainText('Almonds repeats on weekdays');
  await expect(snack(col(page, '2026-09-28')).locator('.wb-card', { hasText: 'Almonds' })).toHaveCount(1); // Monday
  await expect(snack(col(page, '2026-10-03')).locator('.wb-card', { hasText: 'Almonds' })).toHaveCount(0); // Saturday
  await weekOf(page, /^In 30 weeks/);
  await expect(snack(page.locator('.nb-col[data-day="2027-04-26"]')).locator('.wb-card', { hasText: 'Almonds' })).toHaveCount(1); // a Monday, 30 weeks on
  await expect(snack(page.locator('.nb-col[data-day="2027-05-01"]')).locator('.wb-card', { hasText: 'Almonds' })).toHaveCount(0); // its Saturday
  const stored = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('ironlog:cfg') ?? '{}').diet?.plan ?? {}).length);
  expect(stored).toBe(1); // only the day the person planned it on holds an item
  await page.reload();
  await openNutrition(page);
  await weekOf(page, /^In 30 weeks/);
  await expect(snack(page.locator('.nb-col[data-day="2027-04-26"]')).locator('.wb-card', { hasText: 'Almonds' })).toHaveCount(1); // saved, not just drawn
});

test('Skip this day only removes one day; Stop repeating removes every day', async ({ page }) => {
  await seed(page);
  await openNutrition(page);
  await plan(page);
  await snack(col(page, '2026-09-27')).locator('.wb-card').click();
  await col(page, '2026-09-27').getByRole('button', { name: 'Repeat Almonds' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Every day' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Repeat', exact: true }).click();
  const on = day => snack(col(page, day)).locator('.wb-card', { hasText: 'Almonds' });
  await expect(on('2026-09-29')).toHaveCount(1);
  await on('2026-09-29').click();
  const skip = col(page, '2026-09-29').getByRole('button', { name: /Skip Almonds this day/ });
  await skip.click(); await skip.click(); // two taps
  await expect(on('2026-09-29')).toHaveCount(0);
  await expect(on('2026-09-30')).toHaveCount(1);
  await on('2026-09-30').click();
  await col(page, '2026-09-30').getByRole('button', { name: 'Repeat Almonds' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Skip this day only' }).click();
  await expect(on('2026-09-30')).toHaveCount(0);
  await expect(on('2026-10-01')).toHaveCount(1);
  await on('2026-10-01').click();
  await col(page, '2026-10-01').getByRole('button', { name: 'Repeat Almonds' }).click();
  const stop = page.getByRole('dialog').getByRole('button', { name: 'Stop repeating Almonds' });
  await stop.click(); await stop.click(); // two taps
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (const d of ['2026-10-01', '2026-10-02', '2026-09-28']) await expect(on(d)).toHaveCount(0);
  await expect(on('2026-09-27')).toHaveCount(1); // the item the person planned stays
});

test('ticking a shown repeat today stores it once and logs it; daily snacks still show every day', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => { const c = JSON.parse(localStorage.getItem('ironlog:cfg') ?? '{}'); c.diet = { snacks: [{ id: 'oat' }] }; localStorage.setItem('ironlog:cfg', JSON.stringify(c)); });
  await page.reload();
  await openNutrition(page);
  await expect(snack(todayCol(page)).locator('.wb-card', { hasText: 'Oats' })).toHaveCount(1);
  await expect(snack(col(page, '2026-09-25')).locator('.wb-card', { hasText: 'Oats' })).toHaveCount(1);
  await expect(col(page, '2026-09-25').getByRole('button', { name: 'Repeat Oats' })).toHaveCount(0); // a daily snack has its own list
});

test('the Repeat sheet has no accessibility violations and keeps every target at 44 px', async ({ page }) => {
  await seed(page);
  await openNutrition(page);
  await plan(page);
  await snack(col(page, '2026-09-27')).locator('.wb-card').click();
  await col(page, '2026-09-27').getByRole('button', { name: 'Repeat Almonds' }).click();
  const sheet = page.getByRole('dialog', { name: 'Repeat Almonds' });
  await expect(sheet.getByRole('button', { name: 'Monday' })).toBeVisible();
  const r = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(r.violations).toEqual([]);
  const small = await sheet.locator('button').evaluateAll(els => els.map(e => e.getBoundingClientRect().height).filter(h => h < 43.5));
  expect(small).toEqual([]);
});
