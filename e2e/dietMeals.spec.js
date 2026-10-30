import { test, expect } from './fixtures.js';

// Saved meals (brief diet-saved-meals). The rules (make, replace, rename, total, plan) are node tests in dietMeals.test.ts; this covers the wiring:
// tick logged foods and name a meal, tap it to log each food, rename it, delete it with Undo, and a refused name.
const diet = page => page.getByRole('region', { name: 'Diet' });
const nutrition = async page => { await page.click('#tab-daily'); await page.click('#daily-supplements'); };
const log = async (page, name, kcal, p) => {
  await diet(page).getByLabel('Food', { exact: true }).fill(name);
  await diet(page).getByLabel('Calories', { exact: true }).fill(String(kcal));
  await diet(page).getByLabel('Protein (g)').fill(String(p));
  await diet(page).getByRole('button', { name: 'Add', exact: true }).click();
};
const save = async (page, name, foods) => {
  await diet(page).getByRole('button', { name: 'Save as meal' }).click();
  for (const f of foods) await diet(page).getByRole('checkbox', { name: new RegExp(f) }).check();
  await diet(page).getByLabel('Meal name').fill(name);
  await diet(page).getByRole('button', { name: 'Save meal' }).click();
};

test('save two logged foods as a meal, tap it to log them again, and it survives a reload', async ({ page }) => {
  await nutrition(page);
  await expect(diet(page).getByRole('button', { name: 'Save as meal' })).toBeDisabled();
  await log(page, 'Oats', 350, 12);
  await log(page, 'Banana', 100, 1);
  await log(page, 'Coffee', 5, 0);
  await save(page, 'Breakfast', ['Oats', 'Banana']);
  await expect(diet(page).getByRole('status').last()).toContainText('Saved Breakfast.');
  const meal = diet(page).getByRole('list', { name: 'Saved meals' }).getByRole('button', { name: 'Breakfast · 2 foods · 450 kcal' });
  await expect(meal).toBeVisible();
  await meal.click();
  await expect(diet(page).locator('.dt-entry')).toHaveCount(5);
  await expect(diet(page).getByRole('status').last()).toContainText('Added 2 from Breakfast.');
  await page.reload();
  await nutrition(page);
  await expect(diet(page).getByRole('button', { name: 'Breakfast · 2 foods · 450 kcal' })).toBeVisible();
});

test('saving under the same name replaces the meal, and a blank name or nothing ticked is refused', async ({ page }) => {
  await nutrition(page);
  await log(page, 'Oats', 350, 12);
  await log(page, 'Toast', 90, 3);
  await diet(page).getByRole('button', { name: 'Save as meal' }).click();
  await diet(page).getByRole('button', { name: 'Save meal' }).click();
  await expect(diet(page).getByRole('alert')).toContainText('Give the meal a name.');
  await diet(page).getByLabel('Meal name').fill('Snack');
  await diet(page).getByRole('button', { name: 'Save meal' }).click();
  await expect(diet(page).getByRole('alert')).toContainText('Tick at least one food.');
  await diet(page).getByRole('button', { name: 'Cancel' }).click();
  await save(page, 'Snack', ['Oats']);
  await save(page, 'snack', ['Toast']);
  const list = diet(page).getByRole('list', { name: 'Saved meals' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list.getByRole('button', { name: 'snack · 1 food · 90 kcal' })).toBeVisible();
});

test('rename a meal, delete it in two taps, and Undo brings it back', async ({ page }) => {
  await nutrition(page);
  await log(page, 'Oats', 350, 12);
  await save(page, 'Breakfast', ['Oats']);
  await diet(page).getByRole('button', { name: 'Manage' }).click();
  await diet(page).getByRole('button', { name: 'Rename Breakfast' }).click();
  await diet(page).getByLabel('Meal name').last().fill('Morning');
  await diet(page).getByRole('button', { name: 'Save name' }).click();
  await expect(diet(page).getByText('Morning · 1 food · 350 kcal')).toBeVisible();
  await diet(page).getByRole('button', { name: 'Delete Morning' }).click();
  await diet(page).getByRole('button', { name: /Delete Morning/ }).click();
  await expect(diet(page).getByText('Morning · 1 food')).toHaveCount(0);
  await diet(page).getByRole('button', { name: 'Undo' }).click();
  await expect(diet(page).getByText('Morning · 1 food · 350 kcal')).toBeVisible();
});
