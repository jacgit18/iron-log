import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { startRecipe } from './recipesNav.js';

// Editable recipe filters (brief recipe-filter-editing). The rules (tag cleaning, rename and merge, delete, chip order, the AND filter) are node tests
// (recipeTags.test.ts, recipeList.test.ts, recipesSlice.test.ts); this covers what they cannot see: the tags field in the form, the chips on the
// list, the Manage filters sheet and Back closing it, and a reload keeping the setting.
const openRecipes = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); };
const make = async (page, name, cat, tags = []) => {
  await startRecipe(page);
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Category').selectOption({ label: cat });
  await page.getByLabel('Ingredient 1', { exact: true }).fill('salt');
  for (const t of tags) { await page.getByLabel('New tag').fill(t); await page.getByLabel('New tag').press('Enter'); }
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await page.getByRole('button', { name: 'Back to recipes' }).click();
};
const rows = page => page.locator('.rc-list .rc-row b');
const chipRow = page => page.getByLabel('Category', { exact: true }).locator('option'); // the Category dropdown's options

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
  await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Protein' }); // category AND tags
  await expect(rows(page)).toHaveText(['Chili']);
  await tags.getByRole('button', { name: 'weeknight' }).click(); // untick one
  await tags.getByRole('button', { name: 'meal prep' }).click();
  await expect(rows(page)).toHaveText(['Chili', 'Tacos']);
});

test('the form offers tags in use and a typed tag is kept without pressing Add', async ({ page }) => {
  await openRecipes(page);
  await make(page, 'Chili', 'Protein', ['weeknight']);
  await startRecipe(page);
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
  await expect(chipRow(page).first()).toHaveText('All categories');
  await expect(chipRow(page).nth(1)).toHaveText('Sides');
  await expect(chipRow(page).nth(2)).toHaveText('Protein');
  await expect(chipRow(page).filter({ hasText: 'Carbs' })).toHaveCount(0);
  await expect(rows(page)).toHaveText(['Chili']); // hiding a chip loses no recipe
  await page.locator('#recipes-library').click();
  await expect(chipRow(page).filter({ hasText: 'Carbs' })).toHaveCount(0); // the same setting on the Library tab
  await expect(chipRow(page).filter({ hasText: 'Food' })).toHaveCount(0); // as before: the Library has no ready-made chip
  await page.reload();
  await openRecipes(page);
  await expect(chipRow(page).nth(1)).toHaveText('Sides');
  await page.getByRole('button', { name: 'Manage filters' }).click();
  await page.getByRole('dialog', { name: 'Manage filters' }).getByRole('button', { name: 'Show all' }).click();
  await page.getByRole('dialog', { name: 'Manage filters' }).getByRole('button', { name: 'Done' }).click();
  await expect(chipRow(page).nth(1)).toHaveText('Protein');
  await expect(chipRow(page).filter({ hasText: 'Carbs' })).toHaveCount(1);
});

test('hiding the category that is the active filter clears the filter', async ({ page }) => {
  await openRecipes(page);
  await make(page, 'Chili', 'Protein');
  await make(page, 'Rice', 'Carbs');
  await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Carbs' });
  await expect(rows(page)).toHaveText(['Rice']);
  await page.getByRole('button', { name: 'Manage filters' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Hide Carbs' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
  await expect(rows(page)).toHaveText(['Chili', 'Rice']);
});

test('the Filters button counts what is on, and Clear filters (in the bar or under "No recipe matches") turns it all off', async ({ page }) => {
  await openRecipes(page);
  await make(page, 'Chili', 'Protein', ['weeknight']);
  await make(page, 'Rice', 'Carbs');
  const toggle = page.locator('#recipes-filters');
  await expect(toggle).toHaveText('Filters'); // nothing on: no count, no Clear button
  await expect(page.locator('#recipes-clear-filters')).toHaveCount(0);
  await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Protein' });
  await page.getByRole('group', { name: 'Tags', exact: true }).getByRole('button', { name: 'weeknight' }).click();
  await expect(toggle).toHaveText('Filters (2)');
  await page.locator('#recipes-clear-filters').click(); // the bar's button
  await expect(toggle).toHaveText('Filters');
  await expect(rows(page)).toHaveText(['Chili', 'Rice']);
  await page.getByRole('button', { name: 'Can make' }).click(); // nothing in the fixture is makeable: the empty note, with its own Clear button
  await expect(toggle).toHaveText('Filters (1)');
  await expect(page.locator('#recipes-empty')).toBeVisible();
  await page.locator('#recipes-clear-empty').click();
  await expect(toggle).toHaveText('Filters');
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
  await sheet.getByLabel('New name for dinner').fill('  ');
  await sheet.getByRole('button', { name: 'Save name' }).click();
  await expect(sheet.getByRole('alert')).toHaveText('Type a name for the tag.'); // an empty name is refused and shown
  await sheet.getByLabel('New name for dinner').fill('weeknight');
  await sheet.getByRole('button', { name: 'Save name' }).click(); // merges into weeknight
  await expect(sheet.getByText('Renamed to weeknight.')).toBeVisible();
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

test('under "No recipe matches" the button also clears a typed search, and says so', async ({ page }) => {
  await openRecipes(page);
  await make(page, 'Chili', 'Protein');
  await page.getByLabel('Search recipes').fill('zzzz');
  const clear = page.locator('#recipes-clear-empty');
  await expect(clear).toHaveText('Clear search'); // only a search is on
  await clear.click();
  await expect(rows(page)).toHaveText(['Chili']);
  await page.getByLabel('Search recipes').fill('chili');
  await page.getByRole('button', { name: 'Can make' }).click(); // nothing in the fixture is makeable
  await expect(clear).toHaveText('Clear search and filters');
  await clear.click();
  await expect(rows(page)).toHaveText(['Chili']);
  await expect(page.getByLabel('Search recipes')).toHaveValue('');
  await expect(page.locator('#recipes-filters')).toHaveText('Filters');
});

test('Remove tag has an Undo that puts the tag back on the same recipes', async ({ page }) => {
  await openRecipes(page);
  await make(page, 'Chili', 'Protein', ['weeknight']);
  await make(page, 'Tacos', 'Protein', ['weeknight']);
  await page.getByRole('button', { name: 'Manage filters' }).click();
  const sheet = page.getByRole('dialog', { name: 'Manage filters' });
  await sheet.getByRole('button', { name: 'Delete tag weeknight' }).click();
  await sheet.getByRole('button', { name: 'Remove tag' }).click();
  await expect(sheet.getByText('Removed weeknight from 2 recipes.')).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Undo' })).toBeFocused(); // focus goes to Undo, not past it to Done
  await expect(sheet.getByText('weeknight · 2 recipes')).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Undo' }).click();
  await expect(sheet.getByText('Put weeknight back on 2 recipes.')).toBeVisible();
  await expect(sheet.getByText('weeknight · 2 recipes')).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Undo' })).toHaveCount(0); // one Undo per removal
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('group', { name: 'Tags', exact: true }).getByRole('button')).toHaveText(['weeknight']);
});

test('Delete tag on another tag drops the Undo of the earlier removal', async ({ page }) => {
  await openRecipes(page);
  await make(page, 'Chili', 'Protein', ['weeknight', 'spicy']);
  await page.getByRole('button', { name: 'Manage filters' }).click();
  const sheet = page.getByRole('dialog', { name: 'Manage filters' });
  await sheet.getByRole('button', { name: 'Delete tag weeknight' }).click();
  await sheet.getByRole('button', { name: 'Remove tag' }).click();
  await expect(sheet.getByRole('button', { name: 'Undo' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Delete tag spicy' }).click(); // asking about another tag: no stray Undo for the first one
  await expect(sheet.getByRole('button', { name: 'Undo' })).toHaveCount(0);
});

test('Clear filters in the Library source clears the category only, and the tags set on Mine stay', async ({ page }) => {
  await openRecipes(page);
  await make(page, 'Chili', 'Protein', ['weeknight']);
  await page.getByRole('group', { name: 'Tags', exact: true }).getByRole('button', { name: 'weeknight' }).click();
  await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Protein' });
  await page.locator('#recipes-library').click();
  await expect(page.locator('#recipes-filters')).toHaveText('Filters (1)'); // only the category counts here
  await page.locator('#recipes-clear-filters').click();
  await page.locator('#recipes-mine').click();
  await expect(page.getByRole('group', { name: 'Tags', exact: true }).getByRole('button', { name: 'weeknight' })).toHaveAttribute('aria-pressed', 'true');
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
  for (const w of [375, 320]) { // a category row is one line (name, two chevrons, Hide), not two
    await page.setViewportSize({ width: w, height: 700 });
    const row = sheet.locator('.rcf-list').first().locator('li').first();
    expect((await row.boundingBox()).height).toBeLessThanOrEqual(48);
  }
});
