import { test, expect } from './fixtures.js';
import { closeSheet, openAdd, openNutrition, todayCol } from './nutritionBoardHelpers.js';

// Suggested now and Copy from yesterday (brief diet-suggest-and-copy). The ranking and copy rules are node tests in dietSuggest.test.ts; this covers the wiring:
// a food you logged shows up as a one-tap suggestion, the copy checklist adds only what is ticked, and yesterday's empty day disables the button.
// Food is added in the add sheet (ways of adding: Quick add, One-off food, Copy yesterday); the day's Eaten list is on today's column of the Nutrition board.
const nutrition = openNutrition;
const eaten = page => todayCol(page).locator('.nb-eat');
// Types one food into the One-off food form of the open sheet and presses Add.
const log = async (sheet, name, kcal, p) => {
  await sheet.getByLabel('Food', { exact: true }).fill(name);
  await sheet.getByLabel('Calories', { exact: true }).fill(String(kcal));
  await sheet.getByLabel('Protein (g)').fill(String(p));
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
};

test('a logged food comes back as a one-tap suggestion', async ({ page }) => {
  await nutrition(page);
  let sheet = await openAdd(page, 'Quick add');
  await expect(sheet.getByText('Suggested now')).toHaveCount(0);
  await closeSheet(page);
  sheet = await openAdd(page, 'One-off food');
  await log(sheet, 'Oats', 350, 12);
  await closeSheet(page);
  sheet = await openAdd(page, 'Quick add');
  const sugg = sheet.getByRole('list', { name: 'Suggested now' });
  await expect(sugg.getByRole('button', { name: 'Oats · 350 kcal' })).toBeVisible();
  await sugg.getByRole('button', { name: 'Oats · 350 kcal' }).click();
  await expect(sheet.getByRole('status').last()).toContainText('Added Oats.');
  await closeSheet(page);
  await expect(eaten(page)).toHaveCount(2);
});

test('copy from yesterday starts disabled, then adds only the ticked entries', async ({ page }) => {
  await nutrition(page);
  let sheet = await openAdd(page, 'Copy yesterday');
  await expect(sheet.getByRole('button', { name: 'Copy from yesterday' })).toBeDisabled();
  await expect(sheet.getByText('Nothing logged yesterday.')).toBeVisible();
  await closeSheet(page);
  // Logging a past day is gone (last week is read-only on the board), so yesterday's food is written to the saved food log and the app reloaded.
  await page.evaluate(() => localStorage.setItem('ironlog:diet/main', JSON.stringify({ items: [
    { id: 'y-rice', d: '2026-09-23', n: 'Rice', kcal: 200, p: 4 },
    { id: 'y-eggs', d: '2026-09-23', n: 'Eggs', kcal: 150, p: 12 },
  ] })));
  await page.reload();
  await nutrition(page);
  sheet = await openAdd(page, 'Copy yesterday');
  await sheet.getByRole('button', { name: 'Copy from yesterday' }).click();
  await sheet.getByRole('checkbox', { name: /Eggs/ }).uncheck();
  await sheet.getByRole('button', { name: 'Add selected' }).click();
  await expect(sheet.getByRole('status').last()).toContainText('Added 1.');
  await closeSheet(page);
  await expect(eaten(page)).toHaveCount(1);
  await expect(eaten(page)).toContainText('Rice');
});
