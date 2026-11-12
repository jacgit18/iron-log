import { expect, test } from '@playwright/test';
import { addOneOff, closeSheet, dayCol, deleteInRowSheet, eaten, meter, openAdd, openNutrition, openRow, todayCol } from './nutritionBoard.js';
import { signInAs } from './persona.js';

// QA scenario S-01 (Diet, on target): today's column reads the totals, a one-off food moves them, edit and delete move them back, and yesterday shows its own
// full day of five foods.
test('S-01: read today, add a one-off food, edit and delete it, then look at yesterday', async ({ browser }) => {
  const { context, page } = await signInAs(browser, 'diet-on-target');
  await openNutrition(page);
  await expect(eaten(page)).toHaveCount(3, { timeout: 30_000 });
  await expect(meter(todayCol(page), 'Calories', '1,440 / 2,400')).toBeVisible();
  await expect(meter(todayCol(page), 'Protein', '58 / 160')).toBeVisible();
  const sheet = await openAdd(page, 'One-off food');
  await addOneOff(sheet, 'Rice', 200, 4);
  await closeSheet(page);
  await expect(meter(todayCol(page), 'Calories', '1,640 / 2,400')).toBeVisible();
  await expect(meter(todayCol(page), 'Protein', '62 / 160')).toBeVisible();
  const row = await openRow(page, 'Rice'); // a row opens its sheet; Edit and Delete are in it
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await row.getByLabel('Calories', { exact: true }).fill('250');
  await row.getByRole('button', { name: 'Save', exact: true }).click();
  await closeSheet(page);
  await expect(meter(todayCol(page), 'Calories', '1,690 / 2,400')).toBeVisible();
  await deleteInRowSheet(page, await openRow(page, 'Rice'), 'Rice');
  await expect(meter(todayCol(page), 'Calories', '1,440 / 2,400')).toBeVisible();
  const yesterday = dayCol(page, '2026-09-23');
  await expect(yesterday.locator('.nb-eat')).toHaveCount(5);
  await context.close();
});
