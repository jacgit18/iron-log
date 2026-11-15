import { expect, test } from '@playwright/test';
import { addOneOff, closeSheet, eaten, openAdd, openNutrition } from './nutritionBoard.js';
import { signInAs } from './persona.js';

// QA scenario S-18 (Diet, on target): with the browser offline the food search says so, and the rest of the form still works: typing the numbers by hand
// (One-off food) and pressing Add still logs the entry.
test('S-18: offline, the food search says so and Add still logs a typed entry', async ({ browser }) => {
  const { context, page } = await signInAs(browser, 'diet-on-target');
  await openNutrition(page);
  await expect(eaten(page)).toHaveCount(3, { timeout: 30_000 });
  const sheet = await openAdd(page, 'Find food');
  await context.setOffline(true);
  await sheet.getByLabel('Search your past meals and recipes').fill('banana');
  await expect(sheet.getByText('You are offline. You can still type the numbers.')).toBeVisible();
  await expect(sheet.getByText('Food search is not available right now.')).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Back to ways of adding' }).click();
  await sheet.getByRole('button', { name: /^One-off food/ }).click();
  await addOneOff(sheet, 'Banana', 100, 1);
  await closeSheet(page);
  await expect(eaten(page)).toHaveCount(4);
  await expect(eaten(page).filter({ hasText: 'Banana' })).toBeVisible();
  await context.close();
});
