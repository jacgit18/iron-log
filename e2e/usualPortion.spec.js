import { test, expect } from './fixtures.js';
import { openAdd, openNutrition, todayCol } from './nutritionBoardHelpers.js';

// A changed portion becomes the food's usual (brief nutrition-usual-portion). The rule is a node test (src/lib/usualPortion.test.ts); this covers the wiring in the Portion sheet:
// the sheet opens on the usual, the notice and its Undo, logging at the usual saying nothing, and the same sheet from Recipes.
const mk = (id, n, cat, kcal, p, more = {}) => ({ id, n, cat, ing: cat === 'ready' ? [] : [{ n: 'x' }], steps: cat === 'ready' ? [] : ['Cook.'], kcal, p, ...more });
const seed = async page => {
  await page.evaluate(l => localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: l })), [mk('chili', 'Chili', 'protein', 400, 30), mk('egg', 'Egg', 'ready', 70, 6, { usual: 3, unit: 'egg' })]);
  await page.reload();
};
const dlg = page => page.getByRole('dialog').last();
const openChiliSheet = async page => { await openNutrition(page); const add = await openAdd(page, 'Recipes'); await add.getByRole('button', { name: 'Log Chili' }).click(); };
const logHere = page => dlg(page).getByRole('button', { name: 'Log', exact: true });
const finish = page => dlg(page).getByRole('button', { name: 'Done' }).click();
const eaten = page => todayCol(page).locator('.nb-eat');

test('a food never changed opens at its default portion and logging it says nothing about a usual', async ({ page }) => {
  await seed(page);
  await openChiliSheet(page);
  await expect(dlg(page).getByText('1 portion').first()).toBeVisible();
  await logHere(page).click();
  await expect(dlg(page).getByText(/Logged Chili: 1 portion to today\./)).toBeVisible();
  await expect(dlg(page).getByText(/Usual portion saved/)).toHaveCount(0);
});

test('a changed portion becomes the usual: the sheet opens on it next time, Undo restores the old one and keeps the entry', async ({ page }) => {
  await seed(page);
  await openChiliSheet(page);
  await dlg(page).getByRole('button', { name: 'More', exact: true }).click(); // 1.5 portions
  await logHere(page).click();
  await expect(dlg(page).getByText('Usual portion saved: 1.5 portions.')).toBeVisible();
  await finish(page);
  await openChiliSheet(page); // opens on the usual
  await expect(dlg(page).getByText('1.5 portions').first()).toBeVisible();
  await logHere(page).click(); // at the usual: no new notice, no rewrite
  await expect(dlg(page).getByText(/Usual portion saved/)).toHaveCount(0);
  await finish(page);
  await openChiliSheet(page);
  await dlg(page).getByRole('button', { name: 'More', exact: true }).click(); // 2 portions
  await logHere(page).click();
  await expect(dlg(page).getByText('Usual portion saved: 2 portions.')).toBeVisible();
  await dlg(page).getByRole('button', { name: 'Undo', exact: true }).last().click(); // the notice's Undo (the entry's Undo comes first)
  await expect(dlg(page).getByText(/Usual portion saved/)).toHaveCount(0);
  await finish(page);
  await expect(eaten(page)).toHaveCount(3); // Undo of the usual removed no entry
  await openChiliSheet(page);
  await expect(dlg(page).getByText('1.5 portions').first()).toBeVisible(); // back to the previous usual
});

test('the same sheet from a Recipes row remembers the portion too', async ({ page }) => {
  await seed(page);
  await page.click('#tab-daily');
  await page.click('#daily-recipes');
  await page.locator('.rc-item', { hasText: 'Chili' }).getByRole('button', { name: 'Log' }).click();
  await dlg(page).getByRole('button', { name: 'More', exact: true }).click();
  await logHere(page).click();
  await expect(dlg(page).getByText('Usual portion saved: 1.5 portions.')).toBeVisible();
  await finish(page);
  await page.locator('.rc-item', { hasText: 'Chili' }).getByRole('button', { name: 'Log' }).click();
  await expect(dlg(page).getByText('1.5 portions').first()).toBeVisible();
});

test('the recipe page remembers a changed portion too, with the same notice', async ({ page }) => {
  await seed(page);
  await page.click('#tab-daily');
  await page.click('#daily-recipes');
  await page.locator('.rc-item', { hasText: 'Chili' }).click();
  await page.getByRole('button', { name: 'More', exact: true }).first().click();
  await page.getByRole('button', { name: 'Log', exact: true }).click();
  await expect(page.getByText('Usual portion saved: 1.5 portions.')).toBeVisible();
});
