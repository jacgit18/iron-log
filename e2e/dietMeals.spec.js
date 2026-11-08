import { test, expect } from './fixtures.js';

// Saved meals (briefs diet-saved-meals, saved-meals-into-recipes). Save meal now makes a meal in Recipes and Quick add lists the Recipes meals; the rules are node tests (dietMeals.test.ts,
// quickMeals.test.ts, savedMealToRecipe.test.ts, dietSlice.test.ts). This covers the wiring: tick logged foods and name a meal, tap it to log it, a refused name, and the 20 a day limit.
const diet = page => page.getByRole('region', { name: 'Diet' });
const nutrition = async page => { await page.click('#tab-daily'); await page.click('#daily-supplements'); };
const log = async (page, name, kcal, p) => {
  if (!(await diet(page).getByLabel('Food', { exact: true }).isVisible())) await page.getByRole('button', { name: 'Add one' }).click(); // the One-off food form starts folded
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

test('save two logged foods as a meal, tap it to log it again, and it survives a reload', async ({ page }) => {
  await nutrition(page);
  await expect(diet(page).getByRole('button', { name: 'Save as meal' })).toBeDisabled();
  await log(page, 'Oats', 350, 12);
  await log(page, 'Banana', 100, 1);
  await log(page, 'Coffee', 5, 0);
  await save(page, 'Breakfast', ['Oats', 'Banana']);
  await expect(diet(page).getByRole('status').last()).toContainText('Saved Breakfast.');
  const meal = diet(page).getByRole('list', { name: 'Saved meals' }).getByRole('button', { name: 'Breakfast · 1 food · 450 kcal' }); // hand-typed foods have no recipe to link, so the meal logs as one entry with its total
  await expect(meal).toBeVisible();
  await meal.click();
  await expect(diet(page).locator('.dt-entry')).toHaveCount(4);
  await expect(diet(page).getByRole('status').last()).toContainText('Added 1 from Breakfast.');
  await page.reload();
  await nutrition(page);
  await expect(diet(page).getByRole('button', { name: 'Breakfast · 1 food · 450 kcal' })).toBeVisible();
});

test('a blank name, nothing ticked and a name a recipe already has are refused', async ({ page }) => {
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
  await diet(page).getByRole('button', { name: 'Save as meal' }).click();
  await diet(page).getByRole('checkbox', { name: /Toast/ }).check();
  await diet(page).getByLabel('Meal name').fill('snack');
  await diet(page).getByRole('button', { name: 'Save meal' }).click();
  await expect(diet(page).getByRole('alert')).toContainText('already have a recipe or meal');
});

test('Quick add says meals are renamed and edited in Recipes', async ({ page }) => {
  await nutrition(page);
  await log(page, 'Oats', 350, 12);
  await save(page, 'Breakfast', ['Oats']);
  await expect(diet(page).getByText('Rename or edit a meal in Recipes.')).toBeVisible();
  await expect(diet(page).getByRole('button', { name: 'Manage' })).toHaveCount(0);
});

test('a meal stops at 20 a day, and on a full day its button is off', async ({ page }) => {
  await nutrition(page);
  await log(page, 'Oats', 350, 12);
  await save(page, 'One', ['Oats']);
  const list = diet(page).getByRole('list', { name: 'Saved meals' });
  for (let i = 0; i < 19; i++) await list.getByRole('button', { name: /^One · 1 food/ }).click(); // 1 + 19 = 20
  await expect(diet(page).locator('.dt-entry')).toHaveCount(20);
  await expect(list.getByRole('button', { name: /^One · 1 food/ })).toBeDisabled();
});
