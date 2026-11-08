import { test, expect } from './fixtures.js';
import { newRecipe } from './recipesNav.js';

// The Alternative box on a recipe ingredient offers your Groceries items while you type, like the Ingredient box (follow-up to recipe-customise, 2026-10-31).
// The matching rule is a node test (recipeSuggest); this covers the wiring: the list follows the box you are typing in.
test('typing an Alternative offers your Groceries items, and the list follows the box in use', async ({ page }) => {
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  await page.click('#groc-view-inventory'); await page.click('#groc-edit');
  await page.fill('#groc-name', 'Apple cider vinegar'); await page.click('#groc-add');
  await expect(page.locator('#groc-name')).toHaveValue('');
  await page.click('#groc-edit');
  await page.getByRole('checkbox', { name: /Have Apple cider vinegar/ }).check();
  await page.click('#daily-recipes');
  await newRecipe(page);
  await page.getByLabel('Name', { exact: true }).fill('Chimichurri');
  await page.getByLabel('Ingredient 1', { exact: true }).fill('white wine vinegar');
  const alt = page.getByLabel('Alternative for ingredient 1');
  await alt.click();
  await alt.pressSequentially('apple');
  await expect(page.locator('#rc-suggest option')).toHaveAttribute('value', 'Apple cider vinegar');
  await expect(page.getByText('Alternative (if you don’t have it)')).toBeVisible();
  await page.getByLabel('Ingredient 1', { exact: true }).click();
  await page.getByLabel('Ingredient 1', { exact: true }).pressSequentially('x');
  await expect(page.locator('#rc-suggest option')).toHaveCount(0);
});

test('with neither the ingredient nor its Alternative at home, Add missing puts both on Shopping', async ({ page }) => {
  await page.click('#tab-daily'); await page.click('#daily-recipes');
  await newRecipe(page);
  await page.getByLabel('Name', { exact: true }).fill('Porridge');
  await page.getByLabel('Ingredient 1', { exact: true }).fill('milk');
  await page.getByLabel('Alternative for ingredient 1').fill('oat milk');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await page.getByRole('button', { name: 'Add 2 missing to Shopping' }).click();
  await expect(page.getByText('Added 2 to Shopping.')).toBeVisible();
  await page.click('#daily-grocery'); await page.click('#groc-view-shopping');
  await expect(page.getByText('milk', { exact: true })).toBeVisible();
  await expect(page.getByText('oat milk', { exact: true })).toBeVisible();
});
