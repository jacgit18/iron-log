import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { closeSheet, openNutrition, todayCol } from './nutritionBoardHelpers.js';

// Daily snacks (brief daily-snacks). The rules (which snacks show on a day, skips, the list's limit and cleaning) are node tests in dailySnacks.test.ts and dietSlice.test.ts;
// this covers the wiring a node test cannot: Snack between Lunch and Dinner, the setup sheet, the same snacks on today and a day ahead, ticking one today only, skipping one for a day, and a reload. The fixed clock is Thursday 2026-09-24.
const TOMORROW = '2026-09-25';
const col = (page, day) => page.locator(`.nb-col[data-day="${day}"]`);
const snack = c => c.locator('.wb-slot', { has: c.page().locator('.wb-slothd b', { hasText: /^Snack$/ }) });
const mk = (id, n, kcal, p) => ({ id, n, cat: 'sides', ing: [{ n: 'x' }], steps: ['Cook.'], kcal, p });
const seedRecipes = async page => { await page.evaluate(l => localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: l })), [mk('yog', 'Yogurt', 120, 17), mk('bar', 'Bar', 210, 20)]); await page.reload(); };
// Sets up the list from the Snack section, the way a person does.
const setUp = async page => {
  await todayCol(page).getByRole('button', { name: 'Set up daily snacks' }).click();
  const sheet = page.getByRole('dialog', { name: 'Daily snacks' });
  for (const n of ['Yogurt', 'Bar']) {
    await sheet.getByRole('button', { name: 'Add snack', exact: true }).click();
    await sheet.getByRole('button', { name: `Add ${n} to daily snacks` }).click();
  }
  await closeSheet(page);
};

test('Snack sits between Lunch and Dinner, says so when empty, and a saved list shows on today and a day ahead', async ({ page }) => {
  await seedRecipes(page);
  await openNutrition(page);
  await expect(todayCol(page).locator('.wb-slothd b')).toHaveText(['Breakfast', 'Lunch', 'Snack', 'Dinner', 'Supplements', 'Hydration']); // the four meals in order, then the day's other sections
  await expect(snack(todayCol(page))).toContainText('No daily snacks yet');
  await setUp(page);
  for (const c of [todayCol(page), col(page, TOMORROW)]) {
    await expect(snack(c).locator('.wb-card')).toHaveCount(2);
    await expect(snack(c)).toContainText('Yogurt');
    await expect(snack(c)).toContainText('Bar');
  }
  await expect(snack(todayCol(page)).getByRole('button', { name: 'Daily snacks', exact: true })).toBeVisible(); // the same control now edits the list
  await page.reload();
  await openNutrition(page);
  await expect(snack(col(page, TOMORROW)).locator('.wb-card')).toHaveCount(2); // the list is saved, not just drawn
});

test('ticking a daily snack logs it today only; skipping one skips that day; removing it from the list removes it everywhere', async ({ page }) => {
  await seedRecipes(page);
  await openNutrition(page);
  await setUp(page);
  await todayCol(page).getByRole('checkbox', { name: 'Check Yogurt as eaten' }).click();
  await expect(todayCol(page).getByRole('checkbox', { name: 'Uncheck Yogurt as eaten' })).toBeChecked();
  await expect(snack(col(page, TOMORROW))).toContainText('Yogurt'); // tomorrow still lists it, with no check box
  await expect(col(page, TOMORROW).getByRole('checkbox')).toHaveCount(0);
  await snack(todayCol(page)).locator('.wb-card', { hasText: 'Bar' }).click();
  const skip = todayCol(page).locator('.wb-acts').getByRole('button', { name: /Skip Bar today/ });
  await skip.click();
  await skip.click(); // two taps
  await expect(snack(todayCol(page))).not.toContainText('Bar');
  await expect(snack(col(page, TOMORROW))).toContainText('Bar');
  await snack(todayCol(page)).getByRole('button', { name: 'Daily snacks', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Daily snacks' });
  const remove = sheet.getByRole('button', { name: /Remove Yogurt from daily snacks/ });
  await remove.click();
  await remove.click(); // two taps
  await closeSheet(page);
  await expect(snack(col(page, TOMORROW))).not.toContainText('Yogurt');
  await expect(todayCol(page).getByRole('checkbox', { name: 'Uncheck Yogurt as eaten' })).toBeChecked(); // what you ate today stays on today
});

test('the Daily snacks sheet and its picker have no accessibility violations', async ({ page }) => {
  await seedRecipes(page);
  await openNutrition(page);
  await todayCol(page).getByRole('button', { name: 'Set up daily snacks' }).click();
  const sheet = page.getByRole('dialog', { name: 'Daily snacks' });
  expect((await new AxeBuilder({ page }).include('[role=dialog]').analyze()).violations).toEqual([]);
  await sheet.getByRole('button', { name: 'Add snack', exact: true }).click();
  expect((await new AxeBuilder({ page }).include('[role=dialog]').analyze()).violations).toEqual([]);
});
