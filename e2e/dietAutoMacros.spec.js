import { test, expect } from './fixtures.js';

// Less typing for a meal (brief diet-auto-macros). The rules (calories from macros, matching, portion scaling) are node tests in foodMacros.test.ts; this covers the wiring:
// calories fill in as the macros are typed and a typed number wins, a food you logged before comes back from "Find a food" with a portion stepper.
const diet = page => page.getByRole('region', { name: 'Diet' });
const nutrition = async page => { await page.click('#tab-daily'); await page.click('#daily-supplements'); };

test('calories follow protein, carbs and fat until you type calories yourself', async ({ page }) => {
  await nutrition(page);
  await diet(page).getByLabel('Food', { exact: true }).fill('Bowl');
  await diet(page).getByLabel('Protein (g)').fill('40');
  await diet(page).getByLabel('Carbs (g), optional').fill('51');
  await expect(diet(page).getByLabel('Calories', { exact: true })).toHaveValue('');
  await diet(page).getByLabel('Fat (g), optional').fill('11');
  await expect(diet(page).getByLabel('Calories', { exact: true })).toHaveValue('463');
  await diet(page).getByLabel('Calories', { exact: true }).fill('500');
  await diet(page).getByLabel('Fat (g), optional').fill('12');
  await expect(diet(page).getByLabel('Calories', { exact: true })).toHaveValue('500');
  await diet(page).getByRole('button', { name: 'Add', exact: true }).click();
  await expect(diet(page).locator('.dt-entry')).toContainText('500 kcal · 40 g protein · 51 g carbs · 12 g fat');
});

test('Search brings back what you logged with a half-portion stepper', async ({ page }) => {
  await nutrition(page);
  await diet(page).getByLabel('Food', { exact: true }).fill('Rice');
  await diet(page).getByLabel('Calories', { exact: true }).fill('200');
  await diet(page).getByLabel('Protein (g)').fill('4');
  await diet(page).getByRole('button', { name: 'Add', exact: true }).click();
  await diet(page).getByLabel("Search your past meals and recipes").fill('ric');
  await diet(page).getByRole('list', { name: 'Matches' }).getByRole('button', { name: /Rice/ }).click();
  await diet(page).getByRole('button', { name: 'More', exact: true }).click();
  await expect(diet(page).getByText('Rice: 300 kcal · 6 g protein')).toBeVisible();
  await diet(page).getByRole('button', { name: 'Add', exact: true }).first().click();
  await expect(diet(page).locator('.dt-entry')).toHaveCount(2);
  await expect(diet(page).getByRole('status').last()).toContainText('Added 1.5 portions of Rice.');
});
