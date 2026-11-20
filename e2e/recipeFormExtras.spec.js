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

test('desktop: Ctrl+Enter saves, and a double press makes exactly one recipe', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await open(page);
  await page.getByLabel('Name', { exact: true }).fill('Ctrl soup');
  await name(page, 0).fill('Rice');
  await page.keyboard.press('Control+Enter');
  await page.keyboard.press('Control+Enter');
  await expect(page.getByRole('heading', { name: 'Ctrl soup' })).toBeVisible();
  await page.goBack();
  await expect(page.getByText('Ctrl soup')).toHaveCount(1);
});

test('desktop: Ctrl+Enter does not save while the amount picker is open or Discard changes? shows', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await open(page);
  await page.getByLabel('Name', { exact: true }).fill('Held soup');
  await name(page, 0).fill('Rice');
  await page.getByRole('button', { name: /^Amount for ingredient 1:/ }).click();
  await page.getByLabel('Type an amount instead').fill('2 cups');
  await page.keyboard.press('Control+Enter');
  await expect(page.getByRole('heading', { name: 'New recipe' })).toBeVisible(); // not saved: Ctrl+Enter only confirmed the typed amount, which folded the row
  await expect(page.getByRole('button', { name: 'Ingredient 1: Rice · 2 cups. Edit' })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).focus();
  await page.keyboard.press('Escape'); // asks
  await expect(page.getByRole('group', { name: 'Discard changes?' })).toBeVisible();
  await page.keyboard.press('Control+Enter');
  await expect(page.getByRole('heading', { name: 'New recipe' })).toBeVisible();
});

test('a failed save keeps Save enabled and a fixed form saves', async ({ page }) => {
  await open(page);
  await page.getByLabel('Name', { exact: true }).fill('Fix soup');
  await name(page, 0).fill('Rice');
  await page.getByLabel('Servings', { exact: true }).fill('100');
  await page.locator('#rc-save').click();
  await expect(page.getByRole('alert')).toContainText('Servings');
  await expect(page.locator('#rc-save')).toBeEnabled();
  await expect(page.locator('#rc-save')).toHaveText('Save recipe');
  await page.getByLabel('Servings', { exact: true }).fill('2');
  await page.locator('#rc-save').click();
  await expect(page.getByRole('heading', { name: 'Fix soup' })).toBeVisible();
});

test('Remove moves focus to the next row, else the previous, else Add ingredient; the menu closes on Tab away', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await open(page);
  for (const [i, n] of ['Rice', 'Beans', 'Corn'].entries()) {
    await name(page, i).fill(n);
    if (i < 2) await page.getByRole('button', { name: 'Add ingredient' }).click();
  }
  await page.getByRole('button', { name: 'More for ingredient 2' }).click();
  await page.keyboard.press('Tab'); // leaves the menu
  await expect(page.getByRole('button', { name: 'Remove ingredient 2' })).toHaveCount(0);
  await page.getByRole('button', { name: 'More for ingredient 2' }).click();
  await page.getByRole('button', { name: 'Remove ingredient 2' }).click();
  await expect(name(page, 1)).toBeFocused(); // Corn took its place
  await page.getByRole('button', { name: 'More for ingredient 2' }).click();
  await page.getByRole('button', { name: 'Remove ingredient 2' }).click();
  await expect(name(page, 0)).toBeFocused(); // the last row went: the previous one
});

test('the sticky Save bar does not cover the open menu or the Undo notice at the bottom of a long list', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await open(page);
  for (let i = 0; i < 14; i++) {
    await name(page, i).fill(`Item ${i}`);
    await page.getByRole('button', { name: 'Add ingredient' }).click();
  }
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const last = 14; // the empty last row
  await name(page, last).fill('Last');
  await page.getByRole('button', { name: `More for ingredient ${last + 1}` }).click();
  const rm = page.getByRole('button', { name: `Remove ingredient ${last + 1}` });
  await expect(rm).toBeInViewport();
  const onTop = btn => btn.evaluate(el => { const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return el === hit || el.contains(hit); });
  expect(await onTop(rm)).toBe(true);
  await rm.click();
  const undo = page.getByRole('button', { name: 'Undo remove Last' });
  await undo.scrollIntoViewIfNeeded();
  await expect(undo).toBeInViewport();
  expect(await onTop(undo)).toBe(true);
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
