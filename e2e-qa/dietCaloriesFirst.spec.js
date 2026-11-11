import { expect, test } from '@playwright/test';
import { openAdd, openNutrition } from './nutritionBoard.js';
import { signInAs } from './persona.js';

// QA scenario S-13 (Diet, fresh): Calories typed first are not overwritten while the macros are typed after them.
test('S-13: Calories typed first stay at 300 while protein, carbs and fat are typed', async ({ browser }) => {
  const { context, page } = await signInAs(browser, 'diet-fresh');
  await openNutrition(page);
  const sheet = await openAdd(page, 'One-off food');
  const calories = sheet.getByLabel('Calories', { exact: true });
  await calories.fill('300');
  await sheet.getByLabel('Protein (g)').fill('20');
  await page.locator('#dt-add-c').fill('20');
  await page.locator('#dt-add-f').fill('5');
  await expect(calories).toHaveValue('300');
  await context.close();
});
