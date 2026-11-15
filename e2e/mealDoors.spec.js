import { test, expect } from './fixtures.js';
import { closeSheet, openAdd, openNutrition } from './nutritionBoardHelpers.js';

// Meal doors, tightened (owner-approved 2026-11-12). The Nutrition Add food sheet lists "Save as a meal in Recipes" only on a day with something eaten.

test('Add food: no Save as a meal row on a day with nothing eaten; with a logged food the row is there and opens the save form', async ({ page }) => {
  await openNutrition(page);
  let sheet = await openAdd(page);
  await expect(sheet.getByRole('button', { name: /^Copy yesterday/ })).toBeVisible(); // the rest of its group stays
  await expect(sheet.getByRole('button', { name: /^Save as a meal/ })).toHaveCount(0);
  await sheet.getByRole('button', { name: /^One-off food/ }).click();
  await sheet.getByLabel('Food', { exact: true }).fill('Oats');
  await sheet.getByLabel('Calories', { exact: true }).fill('350');
  await sheet.getByLabel('Protein (g)').fill('12');
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await closeSheet(page);
  sheet = await openAdd(page);
  const row = sheet.getByRole('button', { name: /^Save as a meal in Recipes/ });
  await expect(row).toBeVisible();
  await row.click();
  await expect(sheet.getByRole('button', { name: 'Save as a meal', exact: true })).toBeVisible();
  await expect(sheet.getByText('Nothing eaten yet to save.')).toHaveCount(0);
});
