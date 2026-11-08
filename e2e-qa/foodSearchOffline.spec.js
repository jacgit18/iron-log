import { expect, test } from '@playwright/test';
import { signInAs } from './persona.js';

// QA scenario S-18 (Diet, on target): with the browser offline the food search says so, and the rest of the form still works: typing the numbers and
// pressing Add still logs the entry.
test('S-18: offline, the food search says so and Add still logs a typed entry', async ({ browser }) => {
  const { context, page } = await signInAs(browser, 'diet-on-target');
  await page.click('#tab-daily');
  await page.click('#daily-supplements');
  const diet = page.getByRole('region', { name: 'Diet' });
  await expect(diet.locator('.dt-entry')).toHaveCount(3, { timeout: 30_000 });
  await diet.getByRole('button', { name: 'Add one' }).click();
  await context.setOffline(true);
  await diet.getByLabel('Search your past meals and recipes').fill('banana');
  await expect(diet.getByText('You are offline. You can still type the numbers.')).toBeVisible();
  await expect(diet.getByText('Food search is not available right now.')).toHaveCount(0);
  await diet.getByLabel('Food', { exact: true }).fill('Banana');
  await diet.getByLabel('Calories', { exact: true }).last().fill('100');
  await diet.getByLabel('Protein (g)').last().fill('1');
  await diet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(diet.locator('.dt-entry')).toHaveCount(4);
  await expect(diet.locator('.dt-entry', { hasText: 'Banana' })).toBeVisible();
  await context.close();
});
