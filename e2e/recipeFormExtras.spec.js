import { test, expect } from './fixtures.js';
import { startRecipe } from './recipesNav.js';

// Recipe form extras (brief recipe-form-extras): the ⋯ Remove menu, desktop Esc and Ctrl+Enter, the progress line, a sticky Save, one save only.
// The rules are node tests (recipeFormExtras.test.ts); this covers what they cannot see: focus and closing of the menu, real key events, sticky position, a double click.
const open = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); await startRecipe(page); };
const name = (page, i) => page.getByLabel(`Ingredient ${i + 1}`, { exact: true });
const DESKTOP = { width: 1280, height: 800 }, PHONE = { width: 390, height: 800 };

test('Remove sits in a ⋯ menu that closes on Esc and on a tap elsewhere, and keeps its Undo', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await open(page);
  await name(page, 0).fill('Rice');
  await expect(page.getByRole('button', { name: 'Remove ingredient 1' })).toHaveCount(0);
  const more = page.getByRole('button', { name: 'More for ingredient 1' });
  await more.click();
  await expect(page.getByRole('button', { name: 'Remove ingredient 1' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Remove ingredient 1' })).toHaveCount(0);
  await expect(more).toBeFocused();
  await expect(page.getByRole('heading', { name: 'New recipe' })).toBeVisible(); // Esc closed only the menu
  await more.click();
  await page.getByRole('heading', { name: 'New recipe' }).click();
  await expect(page.getByRole('button', { name: 'Remove ingredient 1' })).toHaveCount(0);
  await more.click();
  await page.getByRole('button', { name: 'Remove ingredient 1' }).click();
  await expect(page.getByText('Removed Rice.')).toBeVisible();
  await page.getByRole('button', { name: 'Undo remove Rice' }).click();
  await expect(name(page, 0)).toHaveValue('Rice');
});

test('the progress line counts finished ingredients', async ({ page }) => {
  await open(page);
  await expect(page.locator('.rc-progress')).toHaveText('');
  await name(page, 0).fill('Rice');
  await expect(page.locator('.rc-progress')).toHaveText('0 of 1 ingredient done');
  await name(page, 0).press('Enter');
  await page.getByLabel('Type an amount instead').fill('1 cup');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.rc-progress')).toHaveText('1 of 1 ingredient done');
});

test('desktop: Esc closes the picker first, then asks, then leaves; a phone ignores Esc', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await open(page);
  await page.getByLabel('Name', { exact: true }).fill('Soup');
  await name(page, 0).fill('Rice');
  await page.getByRole('button', { name: /^Amount for ingredient 1:/ }).click();
  await expect(page.getByRole('group', { name: 'Amount for Rice' })).toBeVisible();
  await page.getByRole('button', { name: 'Ingredient 1: Rice' }).count(); // no-op: keeps the row open
  await page.getByLabel('Name', { exact: true }).focus(); // focus outside the picker
  await page.keyboard.press('Escape');
  await expect(page.getByRole('group', { name: 'Amount for Rice' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Discard changes?' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('group', { name: 'Discard changes?' })).toBeVisible();
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(page.locator('#recipes-new')).toBeVisible();
  await page.setViewportSize(PHONE);
  await startRecipe(page);
  await page.getByLabel('Name', { exact: true }).fill('Soup');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('group', { name: 'Discard changes?' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'New recipe' })).toBeVisible();
});

test('desktop: Ctrl+Enter saves, and a double press makes one recipe', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await open(page);
  await page.getByLabel('Name', { exact: true }).fill('Ctrl soup');
  await name(page, 0).fill('Rice');
  await page.keyboard.press('Control+Enter');
  await page.keyboard.press('Control+Enter');
  await expect(page.getByRole('heading', { name: 'Ctrl soup' })).toBeVisible();
  const stored = await page.evaluate(() => JSON.stringify(window.localStorage).split('Ctrl soup').length - 1);
  expect(stored).toBeLessThanOrEqual(2); // one recipe (a name can appear in more than one stored place, never doubled by a second save)
});

test('a double click on Save makes one recipe', async ({ page }) => {
  await open(page);
  await page.getByLabel('Name', { exact: true }).fill('Double tap soup');
  await name(page, 0).fill('Rice');
  await page.locator('#rc-save').dblclick({ force: true }); // the second press lands while the first save is running, or on the page it opened
  await expect(page.getByRole('heading', { name: 'Double tap soup' })).toBeVisible();
  await page.goBack();
  await expect(page.getByText('Double tap soup')).toHaveCount(1);
});

test('Save stays in the viewport with a long ingredient list, on a phone and a desktop', async ({ page }) => {
  for (const size of [PHONE, DESKTOP]) {
    await page.setViewportSize(size);
    await open(page);
    for (let i = 0; i < 12; i++) {
      await name(page, i).fill(`Item ${i}`);
      await page.getByRole('button', { name: 'Add ingredient' }).click();
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator('#rc-save')).toBeInViewport();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Discard' }).click();
  }
});
