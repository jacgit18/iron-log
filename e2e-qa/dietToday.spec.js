import { expect, test } from '@playwright/test';
import { addOneOff, closeSheet, dayCol, eaten, meter, openAdd, openNutrition, todayCol } from './nutritionBoard.js';
import { signInAs } from './persona.js';

// QA scenario S-01 (Diet, on target): today's column reads the totals, a one-off food moves them, edit and delete move them back, and yesterday shows its own
// full day of five foods with no Edit or Delete (only today's food can be changed).
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
  await todayCol(page).getByRole('button', { name: 'Edit Rice' }).click();
  await todayCol(page).getByLabel('Calories', { exact: true }).fill('250');
  await todayCol(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(meter(todayCol(page), 'Calories', '1,690 / 2,400')).toBeVisible();
  await todayCol(page).getByRole('button', { name: 'Delete Rice' }).click();
  await expect(meter(todayCol(page), 'Calories', '1,440 / 2,400')).toBeVisible();
  const yesterday = dayCol(page, '2026-09-23');
  await expect(yesterday.locator('.nb-eat')).toHaveCount(5);
  await expect(yesterday.getByRole('button', { name: /^(Edit|Delete) / })).toHaveCount(0);
  await context.close();
});
