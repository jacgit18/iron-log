import { test, expect } from './fixtures.js';
import { closeSheet, openAdd, openNutrition, todayCol } from './nutritionBoardHelpers.js';

// Less typing for a meal (brief diet-auto-macros). The rules (calories from macros, matching, portion scaling) are node tests in foodMacros.test.ts; this covers the wiring:
// calories fill in as the macros are typed and a typed number wins, a food you logged before comes back from "Find a food" with a portion stepper.
// Food is added in the add sheet (the One-off food form is always open there); the day's Eaten list is on today's column of the Nutrition board.
const nutrition = openNutrition;
const eaten = page => todayCol(page).locator('.nb-eat');

test('calories follow protein, carbs and fat until you type calories yourself', async ({ page }) => {
  await nutrition(page);
  const sheet = await openAdd(page, 'One-off food');
  const kcal = sheet.getByLabel('Calories', { exact: true });
  await sheet.getByLabel('Food', { exact: true }).fill('Bowl');
  await sheet.getByLabel('Protein (g)').fill('40');
  await sheet.getByLabel('Carbs (g), optional').fill('51');
  await expect(kcal).toHaveValue('');
  await sheet.getByLabel('Fat (g), optional').fill('11');
  await expect(kcal).toHaveValue('463');
  await kcal.fill('500');
  await sheet.getByLabel('Fat (g), optional').fill('12');
  await expect(kcal).toHaveValue('500');
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await closeSheet(page);
  await expect(eaten(page)).toContainText('500 kcal · P 40 · C 51 · F 12 g');
});

test('Search brings back what you logged and logs it through the portion sheet (log only)', async ({ page }) => {
  await nutrition(page);
  const sheet = await openAdd(page, 'One-off food');
  await sheet.getByLabel('Food', { exact: true }).fill('Rice');
  await sheet.getByLabel('Calories', { exact: true }).fill('200');
  await sheet.getByLabel('Protein (g)').fill('4');
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await sheet.getByRole('button', { name: 'Back to ways of adding' }).click();
  await sheet.getByRole('button', { name: /^Find food/ }).click();
  await sheet.getByLabel("Search your past meals and recipes").fill('ric');
  await sheet.getByRole('list', { name: 'Matches' }).getByRole('button', { name: /Rice/ }).click();
  // 4c: a food with no recipe opens the same portion sheet and log control a recipe does, log only: no plan days, no meal choice.
  const portion = page.locator('.portionsheet');
  await expect(portion.getByRole('heading', { name: 'Rice' })).toBeVisible();
  await expect(portion.getByLabel('Day')).toHaveAttribute('max', /^\d{4}-\d{2}-\d{2}$/);
  const today = await portion.getByLabel('Day').inputValue();
  await expect(portion.getByLabel('Day')).toHaveAttribute('max', today);
  await expect(portion.getByText('Which meal?')).toHaveCount(0);
  await portion.getByRole('button', { name: 'More', exact: true }).click();
  await expect(portion.getByText('300 kcal · P 6 g', { exact: false }).first()).toBeVisible();
  await portion.getByRole('button', { name: 'Log', exact: true }).click();
  await expect(portion.getByRole('status').last()).toContainText('Logged Rice: 1.5');
  await portion.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); // the portion sheet took the add sheet's place
  await expect(eaten(page)).toHaveCount(2);
  await expect(eaten(page).filter({ hasText: '300 kcal' })).toHaveCount(1);
});
