import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// Sauces and seasonings as linked ingredients (brief recipe-sauce-ingredients). The rules (which recipes can be linked, the exact-name match,
// rename and delete) are node tests (recipeSuggest.test.ts, recipesSlice.test.ts); this covers what they cannot see: the typed name becoming a
// link, the picker's list and focus, the link on the detail page opening the sauce, and the layout on a phone.
const openRecipes = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); };
const make = async (page, name, cat, ingredient = 'salt') => {
  await page.getByRole('button', { name: 'New recipe' }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Category').selectOption({ label: cat });
  await page.getByLabel('Ingredient 1', { exact: true }).fill(ingredient);
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await page.getByRole('button', { name: 'Back to recipes' }).click();
};
const noViolations = async page => {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
};

test('typing a sauce name links it, the detail shows a link that opens the sauce, and a deleted sauce leaves plain text', async ({ page }) => {
  await openRecipes(page);
  await make(page, 'Taco seasoning', 'Seasonings', 'cumin');
  await page.getByRole('button', { name: 'New recipe' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Tacos');
  await page.getByLabel('Ingredient 1', { exact: true }).fill('tac');
  await expect(page.locator('#rc-suggest option').first()).toHaveAttribute('label', 'Taco seasoning · Seasoning');
  await expect(page.getByText('Linked to your sauce or seasoning.')).toHaveCount(0); // a partial name links nothing
  await page.getByLabel('Ingredient 1', { exact: true }).fill('taco seasoning');
  await expect(page.getByText('Linked to your sauce or seasoning.')).toBeVisible();
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await page.getByRole('button', { name: 'Open Taco seasoning, seasoning' }).click();
  await expect(page.getByRole('heading', { name: 'Taco seasoning' })).toBeVisible();
  await expect(page.getByText('cumin')).toBeVisible();
  await page.getByRole('button', { name: 'Delete the recipe Taco seasoning' }).click();
  await page.getByRole('button', { name: 'Tap again to delete' }).click();
  await page.getByRole('button', { name: /Tacos/ }).click();
  await expect(page.locator('.rc-ing', { hasText: 'Taco seasoning' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Open Taco seasoning/ })).toHaveCount(0);
});

test('the picker lists only your sauces and seasonings A to Z, filters, and adds a linked row ready for its amount', async ({ page }) => {
  await openRecipes(page);
  await make(page, 'Pulled pork', 'Protein');
  await make(page, 'Taco seasoning', 'Seasonings');
  await make(page, 'bbq sauce', 'Sauces');
  await make(page, 'Aioli', 'Sauces');
  await page.getByRole('button', { name: 'New recipe' }).click();
  await page.getByRole('button', { name: '+ Sauce or seasoning' }).click();
  const list = page.getByRole('group', { name: 'Sauces and seasonings' });
  await expect(list.getByLabel('Search your sauces and seasonings')).toBeFocused();
  await expect(list.locator('.rc-saucerow b')).toHaveText(['Aioli', 'bbq sauce', 'Taco seasoning']);
  await list.getByLabel('Search your sauces and seasonings').fill('seas');
  await expect(list.locator('.rc-saucerow b')).toHaveText(['Taco seasoning']);
  await list.getByRole('button', { name: /Taco seasoning/ }).click();
  await expect(list).toHaveCount(0);
  await expect(page.getByLabel('Ingredient 1', { exact: true })).toHaveValue('Taco seasoning'); // it filled the empty first row
  await expect(page.getByText('Linked to your sauce or seasoning.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Amount for ingredient 1:/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '+ Sauce or seasoning' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '+ Sauce or seasoning' })).toBeFocused();
});

test('with no sauces the picker says so; on a phone it fits the screen and has no accessibility violations', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openRecipes(page);
  await page.getByRole('button', { name: 'New recipe' }).click();
  await page.getByRole('button', { name: '+ Sauce or seasoning' }).click();
  await expect(page.getByText('You have no sauces or seasonings yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByLabel('Category').selectOption({ label: 'Sauces' });
  await page.getByLabel('Name', { exact: true }).fill('Aioli');
  await page.getByLabel('Ingredient 1', { exact: true }).fill('egg');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await page.getByRole('button', { name: 'Back to recipes' }).click();
  await page.getByRole('button', { name: 'New recipe' }).click();
  await page.getByRole('button', { name: '+ Sauce or seasoning' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await noViolations(page);
});
