import { test, expect } from './fixtures.js';

// Customising a recipe (brief recipe-customise): swap an ingredient for what you use, skip one you leave out, and pick ingredient names from
// your Groceries items. The rules are node tests (recipePantry, recipeSuggest); this covers the form fields, the crossed-out and
// "instead of" rows, the suggestion list, and the pin it sets. The Edited mark needs a library copy, which needs an account, so it is a
// store test (recipesSlice.test.ts), not a browser one.
const atHome = async (page, name) => {
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  await page.click('#groc-view-home'); await page.click('#groc-edit');
  await page.fill('#groc-name', name); await page.click('#groc-add');
  await expect(page.locator('#groc-name')).toHaveValue('');
  await page.click('#groc-edit');
  await page.getByRole('checkbox', { name: new RegExp(`Have ${name}`) }).check();
};
const newRecipe = async (page, name) => {
  await page.click('#tab-daily'); await page.click('#daily-recipes');
  await page.getByRole('button', { name: 'New recipe' }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
};

test('a swapped ingredient is checked as the swap, and a skipped one is left out of the count', async ({ page }) => {
  await atHome(page, 'Apple cider vinegar');
  await newRecipe(page, 'Chimichurri');
  await page.getByLabel('Ingredient 1', { exact: true }).fill('white wine vinegar');
  await page.getByLabel('Swap ingredient 1').fill('apple cider vinegar');
  await page.getByRole('button', { name: 'Add ingredient' }).click();
  await page.getByLabel('Ingredient 2', { exact: true }).fill('parsley');
  await page.getByLabel('Skip ingredient 2').check();
  await page.getByRole('button', { name: 'Save recipe' }).click();
  const swapped = page.locator('.rc-ing', { has: page.getByText('(instead of white wine vinegar)') });
  await expect(swapped).toContainText('apple cider vinegar');
  await expect(swapped.locator('.rc-state')).toHaveText('Have');
  await expect(page.locator('.rc-ing', { has: page.getByText('parsley') }).locator('.rc-state')).toHaveText('Skipped');
  await expect(page.getByText('1 of 1 at home')).toBeVisible();
  await page.getByRole('button', { name: 'Add missing to To get' }).click();
  await expect(page.getByText('Everything is at home.')).toBeVisible();
  // and it survives a reload, with the form still holding both
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-recipes');
  await page.getByRole('button', { name: /Chimichurri/ }).click();
  await expect(page.getByText('(instead of white wine vinegar)')).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Swap ingredient 1')).toHaveValue('apple cider vinegar');
  await expect(page.getByLabel('Skip ingredient 2')).toBeChecked();
});

test('typing an ingredient offers your Groceries items, and a chosen one is pinned to it', async ({ page }) => {
  await atHome(page, 'Chicken thighs');
  await newRecipe(page, 'Roast chicken');
  const field = page.getByLabel('Ingredient 1', { exact: true });
  await field.click();
  await field.pressSequentially('chick');
  await expect(page.locator('#rc-suggest option')).toHaveCount(1);
  await expect(page.locator('#rc-suggest option')).toHaveAttribute('value', 'Chicken thighs');
  await field.fill('Chicken thighs'); // what choosing the suggestion does
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByText('1 of 1 at home')).toBeVisible();
  await expect(page.getByLabel('At home item for Chicken thighs')).not.toHaveValue('');
});

test('a name with no suggestion still saves as typed', async ({ page }) => {
  await newRecipe(page, 'Plain');
  await page.getByLabel('Ingredient 1', { exact: true }).fill('saffron');
  await expect(page.locator('#rc-suggest option')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByRole('heading', { name: /Plain/ })).toBeVisible();
  await expect(page.getByText('saffron')).toBeVisible();
});
