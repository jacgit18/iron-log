import { expect, test } from '@playwright/test';
import { signInAs } from './persona.js';

// QA scenario S-01 (Diet, on target): the Diet card reads today's totals, a one-off food moves them and edit and delete move them back, and yesterday
// shows its own full day of five foods.
test('S-01: read today, add a one-off food, edit and delete it, then look at yesterday', async ({ browser }) => {
  const { context, page } = await signInAs(browser, 'diet-on-target');
  await page.click('#tab-daily');
  await page.click('#daily-supplements');
  const diet = page.getByRole('region', { name: 'Diet' });
  await expect(diet.locator('.dt-entry')).toHaveCount(3, { timeout: 30_000 });
  await expect(diet.getByRole('progressbar', { name: /Calories 1,440 of 2,400/ })).toBeVisible();
  await expect(diet.getByRole('progressbar', { name: /Protein 58 of 160/ })).toBeVisible();
  await diet.getByRole('button', { name: 'Add one' }).click();
  await diet.getByLabel('Food').fill('Rice');
  await diet.getByLabel('Calories', { exact: true }).last().fill('200');
  await diet.getByLabel('Protein (g)').last().fill('4');
  await diet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(diet.getByRole('progressbar', { name: /Calories 1,640 of 2,400/ })).toBeVisible();
  await expect(diet.getByRole('progressbar', { name: /Protein 62 of 160/ })).toBeVisible();
  await diet.getByRole('button', { name: 'Edit Rice' }).click();
  await diet.getByLabel('Calories', { exact: true }).first().fill('250');
  await diet.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(diet.getByRole('progressbar', { name: /Calories 1,690 of 2,400/ })).toBeVisible();
  await diet.getByRole('button', { name: 'Delete Rice' }).first().click();
  await expect(diet.getByRole('progressbar', { name: /Calories 1,440 of 2,400/ })).toBeVisible();
  await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(diet.locator('.dt-entry')).toHaveCount(5);
  await context.close();
});
