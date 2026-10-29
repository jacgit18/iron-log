import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// Recipes on the Daily tab (ADR 084): yours, saved with the rest of your data, and checked against Groceries, At home. The Library needs an
// account (it is searched on the server), so here it only asks you to sign in; the search is covered by server/catalog.test.ts.
const recipes = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); };
const noViolations = async page => {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
};
const write = async (page, name, ingredients, steps = 'Mix.') => {
  await page.getByRole('button', { name: 'New recipe' }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  for (let i = 0; i < ingredients.length; i++) {
    if (i > 0) await page.getByRole('button', { name: 'Add ingredient' }).click();
    await page.getByLabel(`Ingredient ${i + 1}`, { exact: true }).fill(ingredients[i]);
  }
  await page.getByLabel('Steps, one per line').fill(steps);
  await page.getByRole('button', { name: 'Save recipe' }).click();
};

test('Recipes is on the Daily tab for everyone and starts empty', async ({ page }) => {
  await recipes(page);
  await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible();
  await expect(page.getByText('Write your first recipe')).toBeVisible();
  await noViolations(page);
});

test('a recipe you write is saved, marked Custom, found by an ingredient, and kept after a reload', async ({ page }) => {
  await recipes(page);
  await write(page, 'Garlic dressing', ['garlic', 'olive oil']);
  await expect(page.getByRole('heading', { name: /Garlic dressing/ })).toBeVisible();
  await expect(page.getByText('Custom')).toBeVisible();
  await page.getByRole('button', { name: 'Back to recipes' }).click();
  await page.getByLabel('Search recipes').fill('olive');
  await expect(page.getByRole('button', { name: /Garlic dressing/ })).toBeVisible();
  await page.getByLabel('Search recipes').fill('zzz');
  await expect(page.getByText('No recipe matches')).toBeVisible();
  await page.reload();
  await recipes(page);
  await expect(page.getByRole('button', { name: /Garlic dressing/ })).toBeVisible();
});

test('a recipe needs a name and an ingredient', async ({ page }) => {
  await recipes(page);
  await page.getByRole('button', { name: 'New recipe' }).click();
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByRole('alert')).toHaveText('Give the recipe a name.');
  await page.getByLabel('Name', { exact: true }).fill('Plain');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByRole('alert')).toHaveText('Add at least one ingredient.');
});

test('ingredients are checked against At home, and Add missing puts the rest on To get', async ({ page }) => {
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  await page.click('#groc-view-home'); await page.click('#groc-edit');
  await page.fill('#groc-name', 'Garlic'); await page.click('#groc-add');
  await expect(page.locator('#groc-name')).toHaveValue('');
  await page.click('#groc-edit');
  await page.getByRole('checkbox', { name: /Have Garlic/ }).check();
  await recipes(page);
  await write(page, 'Garlic dressing', ['2 cloves garlic', 'fresh parsley']);
  await expect(page.getByText('1 of 2 at home')).toBeVisible();
  await expect(page.locator('.rc-ing', { has: page.getByText('2 cloves garlic') }).locator('.rc-state')).toHaveText('Have');
  await expect(page.locator('.rc-ing', { has: page.getByText('fresh parsley') }).locator('.rc-state')).toHaveText('Missing');
  await noViolations(page);
  await page.getByRole('button', { name: 'Add 1 missing to To get' }).click();
  await expect(page.getByText('Added 1 to To get.')).toBeVisible();
  await page.click('#daily-grocery'); await page.click('#groc-view-get');
  await expect(page.getByText('fresh parsley')).toBeVisible();
});

test('a recipe can be deleted with Undo', async ({ page }) => {
  await recipes(page);
  await write(page, 'Short lived', ['salt']);
  const del = page.getByRole('button', { name: /Delete the recipe Short lived|Tap again to delete/ });
  await del.click(); await del.click();
  await expect(page.getByText('Write your first recipe')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: /Short lived/ })).toBeVisible();
});

test('the Library asks for a sign-in when syncing is off', async ({ page }) => {
  await recipes(page);
  await page.click('#recipes-library');
  await expect(page.getByText('Sign in to browse the recipe library.')).toBeVisible();
});
