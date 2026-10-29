import { test, expect } from './fixtures.js';

// Matching a recipe's ingredients to At home without picking each by hand (brief recipe-auto-match): water counts as Have, an ingredient with a
// close but unsure item offers "Maybe: <item>" (one tap pins it), and "Accept all suggestions" pins every one. The rules are node tests
// (recipePantry.test.ts, recipesSlice.test.ts); this covers the buttons, their placement and what the pin does to Have.
const addHome = async (page, names) => {
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  await page.click('#groc-view-home'); await page.click('#groc-edit');
  for (const name of names) { await page.fill('#groc-name', name); await page.click('#groc-add'); await expect(page.locator('#groc-name')).toHaveValue(''); }
  await page.click('#groc-edit');
  for (const name of names) await page.getByRole('checkbox', { name: new RegExp(`Have ${name}`) }).check();
};
const newRecipe = async (page, name, ingredients) => {
  await page.click('#tab-daily'); await page.click('#daily-recipes');
  await page.getByRole('button', { name: 'New recipe' }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  for (let i = 0; i < ingredients.length; i++) {
    if (i > 0) await page.getByRole('button', { name: 'Add ingredient' }).click();
    await page.getByLabel(`Ingredient ${i + 1}`, { exact: true }).fill(ingredients[i]);
  }
  await page.getByRole('button', { name: 'Save recipe' }).click();
};
// the row whose own name is exactly `name` (the pick lists of the other rows also hold item names)
const state = (page, name) => page.locator('.rc-ing').filter({ has: page.locator('span', { hasText: new RegExp(`^${name}$`) }) }).locator('.rc-state');

test('water is Have with nothing in Groceries and is not added to To get', async ({ page }) => {
  await newRecipe(page, 'Broth', ['boiling water', 'rice']);
  await expect(state(page, 'boiling water')).toHaveText('Have');
  await expect(state(page, 'rice')).toHaveText('Missing');
  await expect(page.getByText('1 of 2 at home')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add 1 missing to To get' })).toBeVisible();
});

test('a longer At home name is matched by itself', async ({ page }) => {
  await addHome(page, ['Boneless skinless chicken breast']);
  await newRecipe(page, 'Grilled chicken', ['chicken breast']);
  await expect(state(page, 'chicken breast')).toHaveText('Have');
});

test('a Maybe is one tap, and Accept all pins the rest', async ({ page }) => {
  await addHome(page, ['Peanut butter', 'Roasted garlic powder']);
  await newRecipe(page, 'Sauce', ['butter', 'garlic']);
  await expect(state(page, 'butter')).toHaveText('Missing'); // a suggestion is not a match
  await page.getByRole('button', { name: 'Maybe: Peanut butter' }).click();
  await expect(state(page, 'butter')).toHaveText('Have');
  await expect(page.getByRole('button', { name: 'Maybe: Peanut butter' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Accept all suggestions' }).click();
  await expect(state(page, 'garlic')).toHaveText('Have');
  await expect(page.getByRole('button', { name: 'Accept all suggestions' })).toHaveCount(0);
  await expect(page.getByText('2 of 2 at home')).toBeVisible();
});
