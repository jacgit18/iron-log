import { expect, test } from '@playwright/test';
import { signInAs } from './persona.js';

// QA scenario S-02 (Diet, over target): the Diet card reads about 120% of the calories with the protein short; at 20 entries the add form is replaced by
// a message, so a 21st cannot be tried, and deleting one brings the form back.
test('S-02: over target on open, and the 20-entries-a-day limit replaces the add form', async ({ browser }) => {
  const { context, page } = await signInAs(browser, 'diet-over-target');
  await page.click('#tab-daily');
  await page.click('#daily-supplements');
  const diet = page.getByRole('region', { name: 'Diet' });
  await expect(diet.locator('.dt-entry').first()).toBeVisible({ timeout: 30_000 });
  await expect(diet.getByRole('progressbar', { name: /Calories 2,(?:[5-9]\d\d|4\d[1-9]|4[1-9]\d) of 2,400 kcal, [\d,]+ over/ })).toBeVisible();
  await expect(diet.getByRole('progressbar', { name: /Protein 10\d of 160/ })).toBeVisible();
  const full = diet.getByText(/That.s 20 things for the day\. Delete one to add another\./);
  for (let guard = 0; guard < 25 && !(await full.isVisible()); guard++) {
    const add = diet.getByRole('button', { name: 'Add one' });
    if (await add.isVisible()) await add.click();
    await diet.getByLabel('Food').fill('Tea');
    await diet.getByLabel('Calories', { exact: true }).last().fill('5');
    await diet.getByLabel('Protein (g)').last().fill('0');
    await diet.getByRole('button', { name: 'Add', exact: true }).click();
  }
  await expect(full).toBeVisible();
  await expect(diet.locator('.dt-entry')).toHaveCount(20);
  await expect(diet.getByRole('button', { name: 'Add', exact: true })).toHaveCount(0);
  await diet.getByRole('button', { name: 'Delete Tea' }).first().click();
  await expect(full).toBeHidden();
  await expect(diet.getByRole('button', { name: /^(Add one|Add)$/ }).first()).toBeVisible();
  await context.close();
});
