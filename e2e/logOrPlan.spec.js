import { test, expect } from './fixtures.js';
import { closeSheet, openAdd, openNutrition, todayCol } from './nutritionBoardHelpers.js';

// The one log-or-plan control (brief log-or-plan-control). What it writes for each case is a node test (src/lib/logOrPlan.test.ts); this covers what needs the real
// screens: one control on the recipe page, the same entry from every door, a day ahead planning on the board, the usual amount in Find food, and Undo. The fixed clock is Thursday 2026-09-24.
const TOMORROW = '2026-09-25';
const mk = (id, n, cat, kcal, p, more = {}) => ({ id, n, cat, ing: cat === 'ready' ? [] : [{ n: 'x' }], steps: cat === 'ready' ? [] : ['Cook.'], kcal, p, ...more });
const seed = async page => {
  await page.evaluate(l => localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: l })), [mk('chili', 'Chili', 'protein', 400, 30), mk('egg', 'Egg', 'ready', 70, 6, { usual: 3, unit: 'egg' })]);
  await page.reload();
};
const openRecipes = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); };
const openChili = async page => { await openRecipes(page); await page.locator('.rc-row', { hasText: 'Chili' }).click(); };
const logBtn = page => page.getByRole('button', { name: 'Log', exact: true });
const eaten = page => todayCol(page).locator('.nb-eat');
const col = (page, day) => page.locator(`.nb-col[data-day="${day}"]`);

test('the recipe page has one Log, no Ate this and no day field', async ({ page }) => {
  await seed(page);
  await openChili(page);
  await expect(page.getByRole('button', { name: 'Ate this' })).toHaveCount(0);
  await expect(logBtn(page)).toHaveCount(1); // the one-tap Log; there was a second, form-opening Log button before the page's action was renamed from Add to today
  await expect(page.getByLabel('Day')).toHaveCount(0);
});

test('every door writes the same entry for the same recipe, portion and day', async ({ page }) => {
  await seed(page);
  await openChili(page); // 1: the recipe page
  await page.getByRole('button', { name: 'Log', exact: true }).click();
  await expect(page.getByText('Logged Chili, 1 portion, for today.')).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.locator('.rc-item', { hasText: 'Chili' }).getByRole('button', { name: 'Log' }).click(); // 2: a Recipes row
  await page.getByRole('dialog').getByRole('button', { name: 'Log', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
  await openNutrition(page);
  let sheet = await openAdd(page, 'Recipes'); // 3: Nutrition > Add food > Recipes
  await sheet.getByRole('button', { name: 'Log Chili' }).click();
  await expect(sheet.getByRole('status').last()).toContainText('Logged Chili, 1 portion.'); // one tap logs; no portion sheet in between (brief nutrition-log-first-portion-row)
  await sheet.getByRole('button', { name: 'Back to ways of adding' }).click();
  await sheet.getByRole('button', { name: /^Find food/ }).click(); // 4: Find food
  await sheet.getByLabel('Search your past meals and recipes').fill('chili');
  await sheet.getByRole('list', { name: 'Matches' }).getByRole('button', { name: /^Chili/ }).first().click();
  await expect(sheet.getByRole('status').last()).toContainText('Logged Chili, 1 portion.');
  await closeSheet(page);
  await expect(eaten(page)).toHaveCount(4);
  for (const row of await eaten(page).all()) await expect(row).toContainText('400 kcal');
  await expect(eaten(page).first()).toContainText('Chili');
});

test('tomorrow asks Which meal?, the button reads Plan, and the recipe lands under that meal on the board; Undo takes only it back', async ({ page }) => {
  await seed(page);
  await openChili(page);
  await expect(page.getByText('Which meal?')).toHaveCount(0);
  await page.getByRole('button', { name: 'Plan…' }).click(); // the portion sheet, opened on tomorrow
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByLabel('Day')).toHaveValue(TOMORROW);
  await expect(dlg.getByText('Which meal?')).toBeVisible();
  await expect(dlg.getByRole('button', { name: 'Log', exact: true })).toHaveCount(0);
  await dlg.getByRole('button', { name: 'More', exact: true }).click(); // 1.5 portions
  await dlg.getByRole('button', { name: 'Dinner', exact: true }).click();
  await dlg.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(dlg.getByText(new RegExp(`Planned .+: 1\\.5 portions for Dinner on ${TOMORROW}\\.`))).toBeVisible();
  await dlg.getByRole('button', { name: 'Done' }).click();
  await openNutrition(page);
  await col(page, TOMORROW).getByRole('button', { name: /^Fri 25/ }).click();
  await expect(col(page, TOMORROW).locator('.wb-slot', { hasText: 'Dinner' }).locator('.wb-card')).toContainText('Chili');
  await expect(eaten(page)).toHaveCount(0); // planning logs nothing
  await openChili(page);
  await page.getByRole('button', { name: 'Plan…' }).click();
  const dlg2 = page.getByRole('dialog');
  await dlg2.getByRole('button', { name: 'Lunch', exact: true }).click();
  await dlg2.getByRole('button', { name: 'Plan', exact: true }).click();
  await dlg2.getByRole('button', { name: 'Undo' }).click();
  await dlg2.getByRole('button', { name: 'Cancel' }).click();
  await openNutrition(page);
  await col(page, TOMORROW).getByRole('button', { name: /^Fri 25/ }).click();
  await expect(col(page, TOMORROW).locator('.wb-slot', { hasText: 'Dinner' }).locator('.wb-card')).toContainText('Chili'); // the Dinner plan stays
  await expect(col(page, TOMORROW).locator('.wb-slot', { hasText: 'Lunch' }).locator('.wb-card')).toHaveCount(0);
});

test('Find food logs a recipe at its usual amount at once, and Undo removes only the entry it made', async ({ page }) => {
  await seed(page);
  await openNutrition(page);
  const sheet = await openAdd(page, 'Find food');
  await sheet.getByLabel('Search your past meals and recipes').fill('egg');
  await sheet.getByRole('list', { name: 'Matches' }).getByRole('button', { name: /^Egg/ }).click();
  await expect(sheet.getByRole('status').last()).toContainText('Logged Egg, 3 eggs.');
  await sheet.getByRole('button', { name: 'Undo' }).click();
  await expect(sheet.getByRole('status').last()).toHaveText('Undone.');
  await closeSheet(page);
  await expect(eaten(page)).toHaveCount(0);
});
