import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// Editable recipe filters (brief recipe-filter-editing). The rules (tag cleaning, rename and merge, delete, chip order, the AND filter) are node tests
// (recipeTags.test.ts, recipeList.test.ts, recipesSlice.test.ts); this covers what they cannot see: the tags field in the form, the chips on the
// list, the Manage filters sheet and Back closing it, and a reload keeping the setting.
const openRecipes = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); };
const make = async (page, name, cat, tags = []) => {
  await page.getByRole('button', { name: 'New recipe' }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Category').selectOption({ label: cat });
  await page.getByLabel('Ingredient 1', { exact: true }).fill('salt');
  for (const t of tags) { await page.getByLabel('New tag').fill(t); await page.getByLabel('New tag').press('Enter'); }
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await page.getByRole('button', { name: 'Back to recipes' }).click();
};
const rows = page => page.locator('.rc-list .rc-row b');
const chipRow = page => page.getByRole('group', { name: 'Category' }).getByRole('button');

test('a tag typed in the form shows as a chip, and a category plus tags show only recipes matching all of them', async ({ page }) => {
  await openRecipes(page);
  await expect(page.getByRole('group', { name: 'Tags', exact: true })).toHaveCount(0); // no tags yet: no tag row
  await make(page, 'Chili', 'Protein', ['weeknight', 'meal prep']);
  await make(page, 'Tacos', 'Protein', ['weeknight']);
  await make(page, 'Rice', 'Carbs', ['weeknight', 'meal prep']);
  const tags = page.getByRole('group', { name: 'Tags', exact: true });
  await expect(tags.getByRole('button')).toHaveText(['meal prep', 'weeknight']);
  await tags.getByRole('button', { name: 'weeknight' }).click();
  await expect(rows(page)).toHaveText(['Chili', 'Rice', 'Tacos']);
  await tags.getByRole('button', { name: 'meal prep' }).click(); // both tags
  await expect(rows(page)).toHaveText(['Chili', 'Rice']);
  await page.getByRole('group', { name: 'Category' }).getByRole('button', { name: 'Protein' }).click(); // category AND tags
  await expect(rows(page)).toHaveText(['Chili']);
  await tags.getByRole('button', { name: 'weeknight' }).click(); // untick one
  await tags.getByRole('button', { name: 'meal prep' }).click();
  await expect(rows(page)).toHaveText(['Chili', 'Tacos']);
});

test('the form offers tags in use and a typed tag is kept without pressing Add', async ({ page }) => {
  await openRecipes(page);
  await make(page, 'Chili', 'Protein', ['weeknight']);
  await page.getByRole('button', { name: 'New recipe' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Soup');
  await page.getByLabel('Ingredient 1', { exact: true }).fill('stock');
  await page.getByRole('button', { name: 'Use weeknight' }).click();
  await page.getByLabel('New tag').fill('Freezer');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await page.getByRole('button', { name: 'Back to recipes' }).click();
  await expect(page.getByRole('group', { name: 'Tags', exact: true }).getByRole('button')).toHaveText(['Freezer', 'weeknight']);
});

test('Manage filters hides and reorders the chips on both tabs, keeps them after a reload, and Back closes the sheet', async ({ page }) => {
  await openRecipes(page);
  await make(page, 'Chili', 'Protein');
  await page.getByRole('button', { name: 'Manage filters' }).click();
  const sheet = page.getByRole('dialog', { name: 'Manage filters' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Hide Carbs' }).click();
  await sheet.getByRole('button', { name: 'Move up Sides' }).click();
  await sheet.getByRole('button', { name: 'Move up Sides' }).click();
  await expect(sheet.getByRole('button', { name: 'Show Carbs' })).toBeVisible();
  await page.goBack(); // one history entry: Back closes the sheet and stays on Recipes
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('#recipes-mine')).toBeVisible();
  await expect(chipRow(page).first()).toHaveText('All');
  await expect(chipRow(page).nth(1)).toHaveText('Sides');
  await expect(chipRow(page).nth(2)).toHaveText('Protein');
  await expect(chipRow(page).filter({ hasText: 'Carbs' })).toHaveCount(0);
  await expect(rows(page)).toHaveText(['Chili']); // hiding a chip loses no recipe
  await page.locator('#recipes-library').click();
  await expect(chipRow(page).filter({ hasText: 'Carbs' })).toHaveCount(0); // the same setting on the Library tab
  await expect(chipRow(page).filter({ hasText: 'Ready-made' })).toHaveCount(0); // as before: the Library has no ready-made chip
  await page.reload();
  await openRecipes(page);
  await expect(chipRow(page).nth(1)).toHaveText('Sides');
  await page.getByRole('button', { name: 'Manage filters' }).click();
  await page.getByRole('dialog', { name: 'Manage filters' }).getByRole('button', { name: 'Show all' }).click();
  await page.getByRole('dialog', { name: 'Manage filters' }).getByRole('button', { name: 'Done' }).click();
  await expect(chipRow(page).nth(1)).toHaveText('Protein');
  await expect(chipRow(page).filter({ hasText: 'Carbs' })).toHaveCount(1);
});

test('hiding the chip that is the active filter clears the filter', async ({ page }) => {
  await openRecipes(page);
  await make(page, 'Chili', 'Protein');
  await make(page, 'Rice', 'Carbs');
  await page.getByRole('group', { name: 'Category' }).getByRole('button', { name: 'Carbs' }).click();
  await expect(rows(page)).toHaveText(['Rice']);
  await page.getByRole('button', { name: 'Manage filters' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Hide Carbs' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
  await expect(rows(page)).toHaveText(['Chili', 'Rice']);
});

test('rename a tag (and merge into one that exists), then delete one after a confirm that says how many', async ({ page }) => {
  await openRecipes(page);
  await make(page, 'Chili', 'Protein', ['weeknight', 'meal prep']);
  await make(page, 'Tacos', 'Protein', ['weeknight']);
  await make(page, 'Rice', 'Carbs', ['dinner']);
  await page.getByRole('button', { name: 'Manage filters' }).click();
  const sheet = page.getByRole('dialog', { name: 'Manage filters' });
  await sheet.getByRole('button', { name: 'Rename dinner' }).click();
  await sheet.getByLabel('New name for dinner').fill('weeknight');
  await sheet.getByRole('button', { name: 'Save name' }).click(); // merges into weeknight
  await expect(sheet.getByText('weeknight · 3 recipes')).toBeVisible();
  await sheet.getByRole('button', { name: 'Delete tag meal prep' }).click();
  await expect(sheet.getByText('Remove “meal prep” from 1 recipe? The recipes stay.')).toBeVisible();
  await sheet.getByRole('button', { name: 'Keep tag' }).click(); // nothing removed
  await expect(sheet.getByText('meal prep · 1 recipe')).toBeVisible();
  await sheet.getByRole('button', { name: 'Delete tag weeknight' }).click();
  await expect(sheet.getByText('Remove “weeknight” from 3 recipes? The recipes stay.')).toBeVisible();
  await sheet.getByRole('button', { name: 'Remove tag' }).click();
  await expect(sheet.getByText('Removed weeknight from 3 recipes.')).toBeVisible();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(rows(page)).toHaveText(['Chili', 'Rice', 'Tacos']); // no recipe is lost
  await expect(page.getByRole('group', { name: 'Tags', exact: true }).getByRole('button')).toHaveText(['meal prep']);
});

test('Manage filters has no accessibility violations and fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await openRecipes(page);
  await make(page, 'Chili', 'Protein', ['weeknight']);
  await page.getByRole('button', { name: 'Manage filters' }).click();
  const sheet = page.getByRole('dialog', { name: 'Manage filters' });
  await expect(sheet).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const b of await sheet.getByRole('button').all()) { const box = await b.boundingBox(); if (box) expect(box.height).toBeGreaterThanOrEqual(43.5); }
});
