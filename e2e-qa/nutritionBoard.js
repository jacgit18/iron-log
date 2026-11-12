import { expect } from '@playwright/test';

// Steps shared by the QA scenarios that use the Nutrition board (the week board that replaced the Diet panel on 2026-11-08). The waits are long on purpose: a QA run
// signs in on a real stack, so the first paint is slower than in the main e2e suite. The main suite's own helpers are e2e/nutritionBoardHelpers.js.
export const openNutrition = async page => {
  await page.click('#tab-daily');
  await page.click('#daily-supplements');
  await expect(page.locator('#nb-h')).toBeVisible({ timeout: 30_000 });
};
// Today's column (the fixed clock is Thursday 2026-09-24) and any other day's by its date.
export const todayCol = page => page.locator('.nb-col.today');
export const dayCol = (page, day) => page.locator(`.nb-col[data-day="${day}"]`);
// The unplanned food on today's column: its Eaten list (the Also eaten list when meals are planned).
export const eaten = page => todayCol(page).locator('.nb-eat');
// A meter on a day column, by its name and what it reads, for example `meter(col, 'Calories', '1,440 / 2,400 kcal')`.
export const meter = (col, name, reads) => col.getByRole('img', { name: new RegExp(`^${name} (eaten so far|planned|eaten): ${reads}`) });
// The add sheet for the selected day, opened on one way of adding ("One-off food", "Find food", "Quick add", ...). Returns the dialog.
export const openAdd = async (page, flow) => {
  await page.locator('#nb-add').click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  if (flow) await sheet.getByRole('button', { name: new RegExp(`^${flow}`) }).click();
  return sheet;
};
export const closeSheet = async page => { await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); };
// Types one food into the One-off food form of the open sheet and presses Add.
export const addOneOff = async (sheet, name, kcal, protein) => {
  await sheet.getByLabel('Food', { exact: true }).fill(name);
  await sheet.getByLabel('Calories', { exact: true }).fill(String(kcal));
  await sheet.getByLabel('Protein (g)').fill(String(protein));
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
};
// An eaten row on today's column opens its row sheet (the numbers, Copy to, Move to, Edit, a two-tap Delete). Returns the dialog.
export const openRow = async (page, name) => {
  // The exact name: hasText alone is a case-insensitive substring ("Rice" would open "Chicken and rice bowl", "Tea" would open "Steak").
  await todayCol(page).locator('.nb-eat').filter({ has: page.locator('.nb-eatn', { hasText: new RegExp(`^${name}$`) }) }).first().getByRole('button').click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name })).toBeVisible();
  return sheet;
};
// Delete in a row sheet takes two presses and the armed button is named "Tap again to delete Delete <name>" (the app puts its label before the old name); the sheet closes itself when the food is gone.
export const deleteInRowSheet = async (page, sheet, name) => {
  await sheet.getByRole('button', { name: `Delete ${name}`, exact: true }).click();
  await sheet.getByRole('button', { name: `Tap again to delete Delete ${name}`, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
};
