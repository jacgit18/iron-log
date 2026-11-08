import { expect, test } from '@playwright/test';
import { signInAs } from './persona.js';

// QA scenario S-13 (Diet, fresh): Calories typed first are not overwritten while the macros are typed after them.
test('S-13: Calories typed first stay at 300 while protein, carbs and fat are typed', async ({ browser }) => {
  const { context, page } = await signInAs(browser, 'diet-fresh');
  await page.click('#tab-daily');
  await page.click('#daily-supplements');
  const diet = page.getByRole('region', { name: 'Diet' });
  await diet.getByRole('button', { name: 'Add one' }).click({ timeout: 30_000 });
  const calories = diet.getByLabel('Calories', { exact: true }).last();
  await calories.fill('300');
  await diet.getByLabel('Protein (g)').last().fill('20');
  await page.locator('#dt-add-c').fill('20');
  await page.locator('#dt-add-f').fill('5');
  await expect(calories).toHaveValue('300');
  await context.close();
});
