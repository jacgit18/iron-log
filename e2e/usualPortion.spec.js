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

test('a food never changed logs at one portion with one tap and says nothing about a usual', async ({ page }) => {
  await seed(page);
  await openChiliSheet(page); // the Add sheet's Recipes way logs at once (brief nutrition-log-first-portion-row)
  await expect(dlg(page).getByText('Logged Chili, 1 portion.')).toBeVisible();
  await expect(dlg(page).getByText(/Usual portion saved/)).toHaveCount(0);
});

test('More on a row logged today becomes the usual, Undo restores the old one and keeps the entry; the next one-tap log uses it', async ({ page }) => {
  await seed(page);
  await openChiliSheet(page);
  await finish(page);
  const row = eaten(page).filter({ hasText: 'Chili' });
  await row.getByRole('button', { name: 'More Chili' }).click(); // 1.5 portions
  await expect(page.locator('.nb-msg')).toContainText('Usual portion saved: Chili, 1.5 portions.');
  await openChiliSheet(page); // opens... logs at the usual
  await expect(dlg(page).getByText('Logged Chili, 1.5 portions.')).toBeVisible();
  await finish(page);
  await eaten(page).filter({ hasText: 'Chili' }).first().getByRole('button', { name: 'More Chili' }).click(); // 2 portions
  await expect(page.locator('.nb-msg')).toContainText('Usual portion saved: Chili, 2 portions.');
  await page.locator('.nb-msg').getByRole('button', { name: 'Undo' }).click();
  await expect(eaten(page)).toHaveCount(2); // Undo of the usual removed no entry
  await openChiliSheet(page);
  await expect(dlg(page).getByText('Logged Chili, 1.5 portions.')).toBeVisible(); // back to the previous usual
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

test('the portion sheet opened from the recipe page (Plan…, day set to today) remembers a changed portion with the same notice', async ({ page }) => {
  await seed(page);
  await page.click('#tab-daily');
  await page.click('#daily-recipes');
  await page.locator('.rc-item', { hasText: 'Chili' }).click();
  await page.getByRole('button', { name: 'Plan…' }).click();
  await dlg(page).getByLabel('Day').fill('2026-09-24');
  await dlg(page).getByRole('button', { name: 'More', exact: true }).click();
  await logHere(page).click();
  await expect(dlg(page).getByText('Usual portion saved: 1.5 portions.')).toBeVisible();
});
