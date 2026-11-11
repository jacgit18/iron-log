import { test, expect } from './fixtures.js';
import { startFood } from './recipesNav.js';

// Whole pack (brief whole-pack). The pack-size rules and the stepper top are node tests (readyMade.test.ts, dietLog.test.ts, labelFill.test.ts); this covers the
// wiring a unit test cannot: the Servings per pack box saving and coming back, the detail line, Whole pack setting the stepper past 10, and a food with no pack size
// keeping the old top of 10.
const openRecipes = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); };
const make = async (page, name, pack) => {
  await openRecipes(page);
  await startFood(page);
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Calories per serving').fill('210');
  await page.getByLabel('Protein per serving (g)').fill('6');
  if (pack !== undefined) await page.getByLabel('Servings per pack, optional').fill(pack);
  await page.getByRole('button', { name: 'Save food' }).click();
};

test('a 12-serving pack: the detail says so, Whole pack sets 12 portions, More stops there, and the log control logs the pack', async ({ page }) => {
  await make(page, 'Gnocchi', '12');
  await expect(page.getByText('12 servings per pack')).toBeVisible();
  const portions = page.getByRole('status').filter({ hasText: /portions?$/ });
  await expect(portions).toHaveText('1 portion');
  await page.getByRole('button', { name: 'Whole pack (12)' }).click();
  await expect(portions).toHaveText('12 portions');
  await expect(page.getByRole('button', { name: 'More', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Whole pack (12)' })).toBeDisabled();
  await page.getByRole('button', { name: 'Less' }).click();
  await expect(portions).toHaveText('11.5 portions');
  await page.getByRole('button', { name: 'Whole pack (12)' }).click();
  await page.getByRole('button', { name: 'Log', exact: true }).click();
  await expect(page.getByText('Logged 12 portions to today.')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Logged 12 portions')).toHaveCount(0);
});

test('the box saves, comes back on edit, and a wrong number is refused', async ({ page }) => {
  await make(page, 'Gnocchi', '2.5');
  await expect(page.getByRole('alert')).toHaveText('Servings per pack must be a whole number from 1 to 99.');
  await page.getByLabel('Servings per pack, optional').fill('8');
  await page.getByRole('button', { name: 'Save food' }).click();
  await expect(page.getByText('8 servings per pack')).toBeVisible();
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('button', { name: /Edit/ }).first().click();
  await expect(page.getByLabel('Servings per pack, optional')).toHaveValue('8');
  await page.getByLabel('Servings per pack, optional').fill('');
  await page.getByRole('button', { name: 'Save food' }).click();
  await expect(page.getByText(/servings per pack/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Whole pack/ })).toHaveCount(0);
});

test('a food with no pack size has no Whole pack button and the stepper stops at 10', async ({ page }) => {
  await make(page, 'Lasagna');
  await expect(page.getByRole('button', { name: /Whole pack/ })).toHaveCount(0);
  const more = page.getByRole('button', { name: 'More', exact: true });
  for (let i = 0; i < 18; i++) await more.click();
  await expect(page.getByRole('status').filter({ hasText: /portions$/ })).toHaveText('10 portions');
  await expect(more).toBeDisabled();
});
