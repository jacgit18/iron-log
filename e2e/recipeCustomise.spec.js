import { test, expect } from './fixtures.js';

// Customising a recipe (brief recipe-customise, form laid out again in recipe-form-mobile-desktop): an Alternative for what you use, a skip saved earlier, and ingredient names from
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

test('an ingredient with an Alternative stays itself and counts as at home when the Alternative is', async ({ page }) => {
  await atHome(page, 'Apple cider vinegar');
  await newRecipe(page, 'Chimichurri');
  await page.getByLabel('Ingredient 1', { exact: true }).fill('white wine vinegar');
  await page.getByLabel('Alternative for ingredient 1').fill('apple cider vinegar');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  const swapped = page.locator('.rc-ing', { has: page.getByText('(or apple cider vinegar)') });
  await expect(swapped).toContainText('white wine vinegar');
  await expect(swapped.locator('.rc-state')).toHaveText('Have');
  await expect(page.getByText('1 of 1 at home')).toBeVisible();
  await page.getByRole('button', { name: 'Add missing to To get' }).click();
  await expect(page.getByText('Everything is at home.')).toBeVisible();
  // and it survives a reload, with the form still holding it
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-recipes');
  await page.getByRole('button', { name: /Chimichurri/ }).click();
  await expect(page.getByText('(or apple cider vinegar)')).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Alternative for ingredient 1')).toHaveValue('apple cider vinegar');
});

// Skip is no longer offered in the form, but a recipe saved with it keeps it: the detail says Skipped (recipePantry.test.ts has the counting rules)
// and the form shows a way out.
test('an ingredient skipped before still shows Skipped, has no Skip checkbox, and Include again clears it', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('ironlog:recipes/main')) localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: [{ id: 'chimi-1', n: 'Chimichurri', cat: 'other', ing: [{ n: 'white wine vinegar' }, { n: 'parsley', skip: true }], steps: ['Mix.'] }] }));
  });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-recipes');
  await page.getByRole('button', { name: /Chimichurri/ }).click();
  await expect(page.locator('.rc-ing', { has: page.getByText('parsley') }).locator('.rc-state')).toHaveText('Skipped');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel(/^Skip ingredient/)).toHaveCount(0);
  await expect(page.getByText('Skipped.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: /^Include again/ }).click();
  await expect(page.getByRole('button', { name: /^Include again/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.locator('.rc-ing', { has: page.getByText('parsley') }).locator('.rc-state')).toHaveText('Missing');
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
