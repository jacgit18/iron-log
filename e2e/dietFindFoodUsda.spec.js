import { test, expect } from './fixtures.js';
import { openAdd, openNutrition } from './nutritionBoardHelpers.js';

// "Search your past meals and recipes" also asks the USDA food search (brief diet-food-lookup follow-up, 2026-10-31). The parsing and caps are node tests;
// this covers the wiring with the route stubbed: one box shows your own matches and the database results, and a database pick fills the Quick add form.
// The search and the One-off food form live in the add sheet (brief nutrition-board): `diet` is that sheet, `nutrition` opens it on Find food, `oneOff` switches to the One-off food way (always open).
const diet = page => page.getByRole('dialog');
const nutrition = async page => { await openNutrition(page); await openAdd(page, 'Find food'); };
const oneOff = async page => { await diet(page).getByRole('button', { name: 'Back to ways of adding' }).click(); await diet(page).getByRole('button', { name: /^One-off food/ }).click(); };
const hits = [{ id: 1, name: 'Oats, rolled', kcal: 379, p: 13.2, c: 67.7, f: 6.5 }];
const stub = (page, status, body) => page.route('**/api/foods/search*', route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }));

test('typing in the past-meals search shows database results, and a pick fills the Quick add form', async ({ page }) => {
  await stub(page, 200, { ok: true, hits });
  await nutrition(page);
  await diet(page).getByLabel('Search your past meals and recipes').fill('oats');
  await expect(diet(page).getByText('Nothing in your meals or recipes matches.')).toBeVisible();
  const found = diet(page).getByRole('list', { name: 'Food database results' });
  await found.getByRole('button', { name: 'Oats, rolled · 379 kcal per 100 g' }).click();
  await diet(page).getByLabel('Grams').fill('50');
  await expect(diet(page).getByText('190 kcal · 6.6 g protein')).toBeVisible();
  await diet(page).getByRole('button', { name: 'Use', exact: true }).click();
  await expect(diet(page).getByLabel('Food', { exact: true })).toHaveValue('Oats, rolled');
  await expect(diet(page).getByLabel('Calories', { exact: true })).toHaveValue('190');
  // The sheet moves on to the One-off food form; going back to Find food shows a cleared search box.
  await diet(page).getByRole('button', { name: 'Back to ways of adding' }).click();
  await diet(page).getByRole('button', { name: /^Find food/ }).click();
  await expect(diet(page).getByLabel('Search your past meals and recipes')).toHaveValue('');
});

test('when the database is down the box still says so and your own matches still work', async ({ page }) => {
  await stub(page, 503, { ok: false, error: 'food search is not available right now', why: 'upstream' });
  await nutrition(page);
  await oneOff(page);
  await diet(page).getByLabel('Food', { exact: true }).fill('Rice');
  await diet(page).getByLabel('Calories', { exact: true }).fill('200');
  await diet(page).getByLabel('Protein (g)').fill('4');
  await diet(page).getByRole('button', { name: 'Add', exact: true }).click();
  await diet(page).getByRole('button', { name: 'Back to ways of adding' }).click();
  await diet(page).getByRole('button', { name: /^Find food/ }).click();
  await diet(page).getByLabel('Search your past meals and recipes').fill('ric');
  await expect(diet(page).getByRole('list', { name: 'Matches' }).getByRole('button', { name: /Rice/ })).toBeVisible();
  await expect(diet(page).getByText('Food search is not available right now.')).toBeVisible();
});
