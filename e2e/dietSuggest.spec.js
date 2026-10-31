import { test, expect } from './fixtures.js';

// Suggested now and Copy from yesterday (brief diet-suggest-and-copy). The ranking and copy rules are node tests in dietSuggest.test.ts; this covers the wiring:
// a food you logged shows up as a one-tap suggestion, the copy checklist adds only what is ticked, and yesterday's empty day disables the button.
const diet = page => page.getByRole('region', { name: 'Diet' });
const nutrition = async page => { await page.click('#tab-daily'); await page.click('#daily-supplements'); await page.getByRole('button', { name: 'Add one' }).click(); }; // the One-off food form starts folded
const log = async (page, name, kcal, p) => {
  await diet(page).getByLabel('Food', { exact: true }).fill(name);
  await diet(page).getByLabel('Calories', { exact: true }).fill(String(kcal));
  await diet(page).getByLabel('Protein (g)').fill(String(p));
  await diet(page).getByRole('button', { name: 'Add', exact: true }).click();
};

test('a logged food comes back as a one-tap suggestion', async ({ page }) => {
  await nutrition(page);
  await expect(diet(page).getByText('Suggested now')).toHaveCount(0);
  await log(page, 'Oats', 350, 12);
  const sugg = diet(page).getByRole('list', { name: 'Suggested now' });
  await expect(sugg.getByRole('button', { name: 'Oats · 350 kcal' })).toBeVisible();
  await sugg.getByRole('button', { name: 'Oats · 350 kcal' }).click();
  await expect(diet(page).locator('.dt-entry')).toHaveCount(2);
  await expect(diet(page).getByRole('status').last()).toContainText('Added Oats.');
});

test('copy from yesterday starts disabled, then adds only the ticked entries', async ({ page }) => {
  await nutrition(page);
  await expect(diet(page).getByRole('button', { name: 'Copy from yesterday' })).toBeDisabled();
  await expect(diet(page).getByText('Nothing logged yesterday.')).toBeVisible();
  // log two foods on yesterday through the Nutrition date bar, then come back to today
  await page.getByRole('button', { name: 'Previous day' }).click();
  await log(page, 'Rice', 200, 4);
  await log(page, 'Eggs', 150, 12);
  await page.getByRole('button', { name: 'Next day' }).click();
  await diet(page).getByRole('button', { name: 'Copy from yesterday' }).click();
  await diet(page).getByRole('checkbox', { name: /Eggs/ }).uncheck();
  await diet(page).getByRole('button', { name: 'Add selected' }).click();
  await expect(diet(page).locator('.dt-entry')).toHaveCount(1);
  await expect(diet(page).locator('.dt-entry')).toContainText('Rice');
  await expect(diet(page).getByRole('status').last()).toContainText('Added 1.');
});
