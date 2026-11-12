import { test, expect } from './fixtures.js';
import { closeSheet, openAdd, openNutrition, todayCol } from './nutritionBoardHelpers.js';

// Saved meals (briefs diet-saved-meals, saved-meals-into-recipes). Save meal now makes a meal in Recipes and Quick add lists the Recipes meals; the rules are node tests (dietMeals.test.ts,
// quickMeals.test.ts, savedMealToRecipe.test.ts, dietSlice.test.ts). This covers the wiring: tick logged foods and name a meal, tap it to log it, a refused name, and the 20 a day limit.
// Food is logged and meals are saved and tapped in the add sheet (ways: One-off food, Save as a meal, Saved meals); the day's Eaten list is on today's column of the Nutrition board.
const nutrition = openNutrition;
const eaten = page => todayCol(page).locator('.nb-eat');
// Goes back to the sheet's list of ways (when a way is open) and picks one by its name.
const way = async (sheet, name) => {
  const back = sheet.getByRole('button', { name: 'Back to ways of adding' });
  if (await back.isVisible()) await back.click();
  await sheet.getByRole('button', { name: new RegExp(`^${name}`) }).click();
};
const log = async (sheet, name, kcal, p) => {
  await way(sheet, 'One-off food');
  await sheet.getByLabel('Food', { exact: true }).fill(name);
  await sheet.getByLabel('Calories', { exact: true }).fill(String(kcal));
  await sheet.getByLabel('Protein (g)').fill(String(p));
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
};
const save = async (sheet, name, foods) => {
  await way(sheet, 'Save as a meal');
  await sheet.getByRole('button', { name: 'Save as a meal', exact: true }).click();
  for (const f of foods) await sheet.getByRole('checkbox', { name: new RegExp(f) }).check();
  await sheet.getByLabel('Meal name').fill(name);
  await sheet.getByRole('button', { name: 'Save meal' }).click();
};

test('save two logged foods as a meal, tap it to log it again, and it survives a reload', async ({ page }) => {
  await nutrition(page);
  let sheet = await openAdd(page, 'Save as a meal');
  await expect(sheet.getByText('Nothing eaten yet to save.')).toBeVisible(); // nothing logged: the way to save has nothing to offer (it was a disabled button on the old panel)
  await log(sheet, 'Oats', 350, 12);
  await log(sheet, 'Banana', 100, 1);
  await log(sheet, 'Coffee', 5, 0);
  await save(sheet, 'Breakfast', ['Oats', 'Banana']);
  await expect(sheet.getByRole('status').last()).toContainText('Saved Breakfast as a meal in Recipes.');
  await way(sheet, 'Saved meals');
  const meal = sheet.getByRole('list', { name: 'Saved meals' }).getByRole('button', { name: 'Breakfast · 1 food · 450 kcal' }); // hand-typed foods have no recipe to link, so the meal logs as one entry with its total
  await expect(meal).toBeVisible();
  await meal.click();
  await expect(sheet.getByRole('status').last()).toContainText('Added 1 from Breakfast.');
  await closeSheet(page);
  await expect(eaten(page)).toHaveCount(4);
  await page.reload();
  await nutrition(page);
  sheet = await openAdd(page, 'Saved meals');
  await expect(sheet.getByRole('button', { name: 'Breakfast · 1 food · 450 kcal' })).toBeVisible();
});

test('a blank name, nothing ticked and a name a recipe already has are refused', async ({ page }) => {
  await nutrition(page);
  const sheet = await openAdd(page);
  await log(sheet, 'Oats', 350, 12);
  await log(sheet, 'Toast', 90, 3);
  await way(sheet, 'Save as a meal');
  await sheet.getByRole('button', { name: 'Save as a meal', exact: true }).click();
  await sheet.getByRole('button', { name: 'Save meal' }).click();
  await expect(sheet.getByRole('alert')).toContainText('Give the meal a name.');
  await sheet.getByLabel('Meal name').fill('Snack');
  await sheet.getByRole('button', { name: 'Save meal' }).click();
  await expect(sheet.getByRole('alert')).toContainText('Tick at least one food.');
  await sheet.getByRole('button', { name: 'Cancel' }).click();
  await save(sheet, 'Snack', ['Oats']);
  await sheet.getByRole('button', { name: 'Save as a meal', exact: true }).click();
  await sheet.getByRole('checkbox', { name: /Toast/ }).check();
  await sheet.getByLabel('Meal name').fill('snack');
  await sheet.getByRole('button', { name: 'Save meal' }).click();
  await expect(sheet.getByRole('alert')).toContainText('already have a recipe or meal');
});

test('Quick add says meals are renamed and edited in Recipes', async ({ page }) => {
  await nutrition(page);
  const sheet = await openAdd(page);
  await log(sheet, 'Oats', 350, 12);
  await save(sheet, 'Breakfast', ['Oats']);
  await way(sheet, 'Saved meals');
  await expect(sheet.getByText('Rename or edit a meal in Recipes.')).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Manage' })).toHaveCount(0);
});

test('a meal stops at 20 a day, and on a full day its button is off', async ({ page }) => {
  await nutrition(page);
  const sheet = await openAdd(page);
  await log(sheet, 'Oats', 350, 12);
  await save(sheet, 'One', ['Oats']);
  await way(sheet, 'Saved meals');
  const list = sheet.getByRole('list', { name: 'Saved meals' });
  for (let i = 0; i < 19; i++) await list.getByRole('button', { name: /^One · 1 food/ }).click(); // 1 + 19 = 20
  await expect(list.getByRole('button', { name: /^One · 1 food/ })).toBeDisabled();
  await closeSheet(page);
  await expect(eaten(page)).toHaveCount(20);
});
