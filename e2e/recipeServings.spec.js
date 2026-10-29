import { test, expect } from './fixtures.js';

// Servings scale a recipe's amounts (brief recipe-servings-scaling). Every amount shape is a node test (recipeScale.test.ts); this covers
// the wiring: the Servings field rewriting the amount fields, the note, what Save keeps, and the view-only "Scale for tonight" stepper.
const open = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); };
const amount = (page, i) => page.getByLabel('Amount').nth(i);
const make = async page => {
  await open(page);
  await page.getByRole('button', { name: 'New recipe' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Pancakes');
  await page.getByLabel('Servings', { exact: true }).fill('4');
  await page.getByLabel('Ingredient 1', { exact: true }).fill('flour');
  await amount(page, 0).fill('2 cups');
  await page.getByRole('button', { name: 'Add ingredient' }).click();
  await page.getByLabel('Ingredient 2', { exact: true }).fill('salt');
  await amount(page, 1).fill('pinch');
};

test('changing Servings rewrites the amounts, and Save keeps the new amounts', async ({ page }) => {
  await make(page);
  await page.getByLabel('Servings', { exact: true }).fill('8');
  await expect(amount(page, 0)).toHaveValue('4 cups');
  await expect(amount(page, 1)).toHaveValue('pinch');
  await expect(page.getByText('1 amount left as written.')).toBeVisible();
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByText('4 cups flour')).toBeVisible();
  await expect(page.getByText('Other · 8 servings')).toBeVisible();
  await page.reload();
  await open(page);
  await page.getByRole('button', { name: /Pancakes/ }).click();
  await expect(page.getByText('4 cups flour')).toBeVisible();
});

test('going back to the old servings gives the old amounts exactly', async ({ page }) => {
  await make(page);
  const servings = page.getByLabel('Servings', { exact: true });
  await servings.fill('8'); await servings.fill('5'); await servings.fill('4');
  await expect(amount(page, 0)).toHaveValue('2 cups');
});

test('an amount typed by hand becomes the base for the next change', async ({ page }) => {
  await make(page);
  await amount(page, 0).fill('3 cups');
  await page.getByLabel('Servings', { exact: true }).fill('8');
  await expect(amount(page, 0)).toHaveValue('6 cups');
});

test('with no servings yet, entering one only sets what the amounts are for', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'New recipe' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Soup');
  await page.getByLabel('Ingredient 1', { exact: true }).fill('stock');
  await amount(page, 0).fill('2 cups');
  await page.getByLabel('Servings', { exact: true }).fill('6');
  await expect(amount(page, 0)).toHaveValue('2 cups');
  await expect(page.getByText('The amounts are taken as being for 6 servings.')).toBeVisible();
});

test('typing a two-digit Servings key by key does not scale the amounts by the first digit', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'New recipe' }).click();
  await page.getByLabel('Ingredient 1', { exact: true }).fill('stock');
  await amount(page, 0).fill('2 cups');
  const servings = page.getByLabel('Servings', { exact: true });
  await servings.click();
  await servings.pressSequentially('12');
  await expect(amount(page, 0)).toHaveValue('2 cups');
  await servings.press('Tab'); // the amounts are now for 12 servings
  await servings.fill('24');
  await expect(amount(page, 0)).toHaveValue('4 cups');
});

test('Scale for tonight changes the amounts shown and saves nothing', async ({ page }) => {
  await make(page);
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByText('2 cups flour')).toBeVisible();
  await page.getByRole('button', { name: 'More servings' }).click();
  await expect(page.getByText('5 servings', { exact: true })).toBeVisible();
  await expect(page.getByText('2½ cups flour')).toBeVisible();
  await page.getByRole('button', { name: 'Reset to 4' }).click();
  await expect(page.getByText('2 cups flour')).toBeVisible();
  await page.getByRole('button', { name: 'More servings' }).click();
  await page.getByRole('button', { name: 'Back to recipes' }).click();
  await page.getByRole('button', { name: /Pancakes/ }).click();
  await expect(page.getByText('2 cups flour')).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(amount(page, 0)).toHaveValue('2 cups');
});
