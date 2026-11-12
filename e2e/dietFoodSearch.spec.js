import { test, expect } from './fixtures.js';
import { openAdd, openNutrition } from './nutritionBoardHelpers.js';

// Food search (brief diet-food-lookup; the separate Look up nutrition box was removed by recipe-first-diet-log, the same lookup now sits under the past-meals search). The parsing, scaling and caps are node tests (foods.test.ts, foodSearch.test.ts); this covers the wiring with the
// route stubbed: type, wait for the pause, pick a result, set grams, the form fills in and stays editable, then the failure and empty texts.
// The search and the One-off food form now live in the add sheet (brief nutrition-board): `diet` is that sheet, `nutrition` opens it on Find food, `oneOff` goes to the One-off food way (the form is always open there).
const diet = page => page.getByRole('dialog');
const nutrition = async page => { await openNutrition(page); await openAdd(page, 'Find food'); };
const oneOff = async page => { await diet(page).getByRole('button', { name: 'Back to ways of adding' }).click(); await diet(page).getByRole('button', { name: /^One-off food/ }).click(); };
const eaten = page => page.locator('.nb-col.today .nb-eat');
const hits = [
  { id: 1, name: 'Chicken breast, raw', kcal: 120, p: 22.5, c: 0, f: 2.6 },
  { id: 2, name: 'Granola bar', brand: 'Acme', kcal: 450, p: 8, c: 65, serving: 40 },
];
const stub = (page, status, body) => page.route('**/api/foods/search*', route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }));

test('pick a food, set the grams, and the entry form is filled in and can still be edited', async ({ page }) => {
  await stub(page, 200, { ok: true, hits });
  await nutrition(page);
  await diet(page).getByLabel('Search your past meals and recipes').fill('chicken');
  const found = diet(page).getByRole('list', { name: 'Food database results' });
  await expect(found.getByRole('button', { name: 'Chicken breast, raw · 120 kcal per 100 g' })).toBeVisible();
  await found.getByRole('button', { name: 'Chicken breast, raw · 120 kcal per 100 g' }).click();
  await expect(diet(page).getByLabel('Grams')).toHaveValue('100');
  await diet(page).getByLabel('Grams').fill('150');
  await expect(diet(page).getByText('180 kcal · P 33.8 · C 0 · F 3.9 g')).toBeVisible();
  await diet(page).getByRole('button', { name: 'Use', exact: true }).click();
  await expect(diet(page).getByLabel('Food', { exact: true })).toHaveValue('Chicken breast, raw');
  await expect(diet(page).getByLabel('Calories', { exact: true })).toHaveValue('180');
  await expect(diet(page).getByLabel('Protein (g)')).toHaveValue('33.8');
  await expect(diet(page).getByLabel('Carbs (g), optional')).toHaveValue('0');
  await expect(diet(page).getByLabel('Fat (g), optional')).toHaveValue('3.9');
  await diet(page).getByLabel('Calories', { exact: true }).fill('175');
  await diet(page).getByRole('button', { name: 'Add', exact: true }).click();
  await diet(page).getByRole('button', { name: 'Done' }).click();
  await expect(eaten(page)).toHaveCount(1);
  await expect(eaten(page)).toContainText('Chicken breast, raw');
  await expect(eaten(page)).toContainText('175');
  await page.reload();
  await openNutrition(page);
  await expect(eaten(page)).toContainText('Chicken breast, raw');
});

test('a branded food starts at its serving, and a bad grams value blocks Use', async ({ page }) => {
  await stub(page, 200, { ok: true, hits });
  await nutrition(page);
  await diet(page).getByLabel('Search your past meals and recipes').fill('granola');
  await diet(page).getByRole('button', { name: 'Granola bar (Acme) · 450 kcal per 100 g' }).click();
  await expect(diet(page).getByLabel('Grams')).toHaveValue('40');
  await expect(diet(page).getByText('180 kcal · P 3.2 · C 26 g')).toBeVisible();
  await diet(page).getByLabel('Grams').fill('0');
  await expect(diet(page).getByRole('button', { name: 'Use', exact: true })).toBeDisabled();
  await expect(diet(page).getByText('Enter grams from 1 to 5000.')).toBeVisible();
});

test('no results, a server that is not set up, and a daily limit each say so and leave typing alone', async ({ page }) => {
  await nutrition(page);
  const box = diet(page).getByLabel('Search your past meals and recipes');
  await stub(page, 200, { ok: true, hits: [] });
  await box.fill('zzzz');
  await expect(diet(page).getByText('No foods found. Type the numbers instead.')).toBeVisible();
  await page.unroute('**/api/foods/search*');
  await stub(page, 503, { ok: false, error: 'food search is not available right now' });
  await box.fill('oats');
  await expect(diet(page).getByText('Food search is not available right now. You can still type the numbers.')).toBeVisible();
  await page.unroute('**/api/foods/search*');
  await stub(page, 429, { ok: false, error: 'limit' });
  await box.fill('rice');
  await expect(diet(page).getByText('You have used today’s food searches. You can still type the numbers.')).toBeVisible();
  await oneOff(page);
  await diet(page).getByLabel('Food', { exact: true }).fill('Plain rice');
  await expect(diet(page).getByLabel('Food', { exact: true })).toHaveValue('Plain rice');
});

test('one letter asks nothing', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/foods/search*', route => { calls++; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, hits }) }); });
  await nutrition(page);
  await diet(page).getByLabel('Search your past meals and recipes').fill('c');
  await page.waitForTimeout(600);
  expect(calls).toBe(0);
  await expect(diet(page).getByRole('list', { name: 'Food database results' })).toHaveCount(0);
});

test('editing a macro after a pick keeps the calories the search gave', async ({ page }) => {
  await stub(page, 200, { ok: true, hits });
  await nutrition(page);
  await diet(page).getByLabel('Search your past meals and recipes').fill('granola');
  await diet(page).getByRole('button', { name: 'Granola bar (Acme) · 450 kcal per 100 g' }).click();
  await diet(page).getByRole('button', { name: 'Use', exact: true }).click();
  await expect(diet(page).getByLabel('Calories', { exact: true })).toHaveValue('180');
  await diet(page).getByLabel('Protein (g)').fill('5');
  await expect(diet(page).getByLabel('Calories', { exact: true })).toHaveValue('180');
});
