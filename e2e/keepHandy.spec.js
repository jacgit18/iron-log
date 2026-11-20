import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { closeSheet, openAdd, openNutrition } from './nutritionBoardHelpers.js';

// Keep handy (brief nutrition-keep-handy). The rules (tray split, caps, totals, Remove back to the tray) are node tests (repeats.test.ts, dietSlice.test.ts, diet.test.ts);
// this covers the wiring: the third choice in the Repeat sheet, the collapsed tray under the meal, + Add putting the food on that day only, a reload and an axe pass. The fixed clock is Thursday 2026-09-24.
const mk = (id, n, kcal, p) => ({ id, n, cat: 'sides', ing: [{ n: 'x' }], steps: ['Cook.'], kcal, p });
const seed = async page => { await page.evaluate(l => localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: l })), [mk('alm', 'Almonds', 170, 6)]); await page.reload(); };
const col = (page, day) => page.locator(`.nb-col[data-day="${day}"]`);
const snack = c => c.locator('.wb-slot', { has: c.page().locator('.wb-slothd b', { hasText: /^Snack$/ }) });
const tray = (page, day) => snack(col(page, day)).getByRole('button', { name: /^Handy · / });

// Plans Almonds in Snack on Sun 2026-09-27, opens its Repeat sheet and keeps it handy.
const keepHandy = async page => {
  await page.getByRole('button', { name: 'Next week', exact: true }).click();
  await col(page, '2026-09-27').locator('.nb-dayname').click();
  const sheet = await openAdd(page, 'Recipes');
  await sheet.getByRole('group', { name: 'Which meal' }).getByRole('button', { name: 'Snack', exact: true }).click();
  await sheet.getByLabel('Find a recipe').fill('Almonds');
  await sheet.getByRole('button', { name: 'Plan Almonds for Snack' }).click();
  await closeSheet(page);
  await snack(col(page, '2026-09-27')).locator('.wb-card').click();
  await col(page, '2026-09-27').getByRole('button', { name: 'Repeat Almonds' }).click();
  const rep = page.getByRole('dialog', { name: 'Repeat Almonds' });
  await rep.getByRole('button', { name: 'Keep handy', exact: true }).click();
  await expect(rep.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-pressed', 'false');
  await expect(rep.getByRole('status')).toContainText('Kept handy for Snack. Add it to a day with + Add.');
  await rep.getByRole('button', { name: 'Keep handy', exact: true }).last().click(); // Save
  await expect(page.getByRole('dialog')).toHaveCount(0);
};

test('Keep handy puts the food in a collapsed tray on other days, and + Add stores it on that day only', async ({ page }) => {
  await seed(page);
  await openNutrition(page);
  await keepHandy(page);
  const t = tray(page, '2026-09-28'); // Monday
  await expect(t).toHaveAttribute('aria-expanded', 'false');
  await expect(snack(col(page, '2026-09-28')).locator('.wb-card')).toHaveCount(0); // not on the card
  await expect(tray(page, '2026-09-27')).toHaveCount(0); // the day it was planned on holds the real item
  await t.click();
  await expect(t).toHaveAttribute('aria-expanded', 'true');
  await snack(col(page, '2026-09-28')).getByRole('button', { name: '+ Add Almonds to Snack' }).click();
  await expect(snack(col(page, '2026-09-28')).locator('.wb-card', { hasText: 'Almonds' })).toHaveCount(1);
  await expect(tray(page, '2026-09-28')).toHaveCount(0); // gone from that day's tray
  await expect(tray(page, '2026-09-29')).toHaveCount(1); // other days keep it
  await page.reload();
  await openNutrition(page);
  await page.getByRole('button', { name: 'Next week', exact: true }).click();
  await expect(tray(page, '2026-09-29')).toHaveCount(1); // saved, not just drawn
  await expect(snack(col(page, '2026-09-28')).locator('.wb-card', { hasText: 'Almonds' })).toHaveCount(1);
});

test('the tray has no accessibility violations, open or collapsed', async ({ page }) => {
  await seed(page);
  await openNutrition(page);
  await keepHandy(page);
  await tray(page, '2026-09-28').click();
  const r = await new AxeBuilder({ page }).include('.nb-col[data-day="2026-09-28"]').analyze();
  expect(r.violations).toEqual([]);
});
