import { test, expect } from './fixtures.js';

// Recipe serving size (brief recipe-serving-size). The estimate rules and the cleaner are node tests (recipeServing.test.ts, recipes.test.ts); this covers the form
// wiring and the detail line: the two boxes save and come back, Estimate from ingredients fills the grams and says what it left out, and the detail shows the size.
const open = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); };
const setAmount = async (page, i, text) => {
  await page.getByRole('button', { name: new RegExp(`^Amount for ingredient ${i + 1}:`) }).click();
  await page.getByLabel('Type an amount instead').fill(text);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
};
const start = async page => {
  await open(page);
  await page.getByRole('button', { name: 'New recipe' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Bread');
  await page.getByLabel('Servings', { exact: true }).fill('4');
  await page.getByLabel('Ingredient 1', { exact: true }).fill('flour');
  await setAmount(page, 0, '500 g');
  await page.getByRole('button', { name: 'Add ingredient' }).click();
  await page.getByLabel('Ingredient 2', { exact: true }).fill('milk');
  await setAmount(page, 1, '2 cups');
};

test('Estimate from ingredients fills the grams and names what it left out; saving shows the size on the recipe', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Estimate from ingredients' }).click();
  await expect(page.getByLabel('Grams per serving')).toHaveValue('125'); // 500 g over 4 servings; the cups are not guessed
  await expect(page.getByText('Counted 1 of 2 ingredients. Left out: milk.')).toBeVisible();
  await page.getByLabel('Serving size', { exact: true }).fill('1 slice');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByText('Serving size: 1 slice (125 g)')).toBeVisible();
  await page.reload();
  await open(page);
  await page.getByRole('button', { name: /Bread/ }).click();
  await expect(page.getByText('Serving size: 1 slice (125 g)')).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Serving size', { exact: true })).toHaveValue('1 slice');
  await expect(page.getByLabel('Grams per serving')).toHaveValue('125');
});

test('with no amount in grams the estimate says so and fills nothing, and a bad grams value blocks Save', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'New recipe' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Soup');
  await page.getByLabel('Ingredient 1', { exact: true }).fill('stock');
  await setAmount(page, 0, '2 cups');
  await page.getByRole('button', { name: 'Estimate from ingredients' }).click();
  await expect(page.getByText('No ingredients are written in grams, ounces or pounds.')).toBeVisible();
  await expect(page.getByLabel('Grams per serving')).toHaveValue('');
  await page.getByLabel('Grams per serving').fill('9999');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByText('Grams per serving must be a whole number from 1 to 5000.')).toBeVisible();
});

test('a recipe with no serving size shows no extra line', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'New recipe' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Plain');
  await page.getByLabel('Ingredient 1', { exact: true }).fill('salt');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByRole('heading', { name: 'Ingredients' })).toBeVisible();
  await expect(page.getByText(/^Serving size:/)).toHaveCount(0);
});
