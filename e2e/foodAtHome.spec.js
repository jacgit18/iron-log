import { test, expect } from './fixtures.js';
import { openAdd, openNutrition, todayCol } from './nutritionBoardHelpers.js';

// Brief ready-made-have-gate: a ready-made food's At home item. The rules (pin beats name, '-' is Not tracked, a deleted pin is ignored) are node tests (src/lib/boardStock.test.ts);
// this spec checks the picker on the food's page and that the Foods pill, the Add food pill and the board pill all follow the pin, and that it survives a reload. Clock: Thursday 2026-09-24.
const food = (id, n) => ({ id, n, cat: 'ready', ing: [], steps: [], kcal: 100, p: 5 });
const item = (id, n) => ({ id, n, store: 'Anywhere', qty: 1, cents: null, every: false, out: false });
const seed = async page => {
  await page.evaluate(([recipes, items, plan]) => {
    localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: recipes }));
    localStorage.setItem('ironlog:grocery/main', JSON.stringify({ stores: ['Anywhere'], items }));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify({ lines: { skyr: { have: true } }, pulled: [] }));
    const c = JSON.parse(localStorage.getItem('ironlog:config/main') || '{}');
    localStorage.setItem('ironlog:config/main', JSON.stringify({ ...c, diet: { plan: { '2026-09-24': plan } } }));
  }, [[food('yog', 'Greek yogurt')], [item('yog', 'Greek yogurt'), item('skyr', 'Skyr')], [{ k: 'r', id: 'yog', s: 'snack' }]]);
  await page.reload();
};
const openFoods = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); };
const listPill = page => page.locator('.rc-item', { hasText: 'Greek yogurt' }).locator('.rc-stock');
const boardPill = page => todayCol(page).locator('.wb-card', { hasText: 'Greek yogurt' }).locator('.wb-stock');

test('pin a food to another item or to Not tracked: the Foods, Add food and board pills follow the pin and it survives a reload', async ({ page }) => {
  await seed(page);
  await openFoods(page);
  await expect(listPill(page)).toHaveText('Need'); // matched by name to the unticked Greek yogurt
  await page.locator('.rc-row', { hasText: 'Greek yogurt' }).click();
  const pick = page.getByLabel('At home item');
  await expect(pick).toHaveValue('');
  await pick.selectOption({ label: 'Skyr' }); // the pinned item is at home
  await expect(page.getByRole('status').filter({ hasText: 'counts as' })).toContainText('Have');
  await page.getByRole('button', { name: 'Back to recipes' }).first().click().catch(() => {}); // a phone shows the page full width; the desktop pane has no Back
  await expect(listPill(page)).toHaveText('Have');
  await openNutrition(page);
  await expect(boardPill(page)).toHaveText('Have');
  const sheet = await openAdd(page, 'Recipes');
  await expect(sheet.locator('li', { hasText: 'Greek yogurt' }).locator('.rc-stock')).toHaveText('Have');
  await sheet.getByRole('button', { name: 'Done' }).click();
  await openFoods(page);
  await page.locator('.rc-row', { hasText: 'Greek yogurt' }).click();
  await page.getByLabel('At home item').selectOption({ label: 'Not tracked' });
  await expect(page.getByRole('status').filter({ hasText: 'Not tracked' })).toBeVisible();
  await page.reload();
  await openFoods(page);
  await expect(listPill(page)).toHaveCount(0);
  await openNutrition(page);
  await expect(boardPill(page)).toHaveCount(0); // Not tracked: no mark although the name matches an item
});
