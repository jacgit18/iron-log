import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { openManage, openNutrition } from './nutritionBoardHelpers.js';

// Plate hints per meal (brief nutrition-plate-hints-per-meal). Which food is suggested and what is hidden are node tests (weekBoard.test.ts, diet.test.ts);
// this covers the wiring: the Manage switches, the × on a hint, and a reload keeping both. Today is 2026-09-24 in these specs.
test.use({ viewport: { width: 1600, height: 1000 } });
const TODAY = '2026-09-24', TOMORROW = '2026-09-25';
const seed = async page => {
  const mk = (id, n, cat, kcal, p, extra) => ({ id, n, cat, ing: [{ n: 'x' }], steps: ['Cook.'], kcal, p, ...extra });
  const recipes = [mk('toast', 'Toast', 'carbs', 160, 5), mk('beef', 'Braised beef', 'protein', 500, 40, { meal: 'dinner' }), mk('eggs', 'Eggs', 'protein', 150, 12, { meal: 'breakfast' })];
  const planned = [{ k: 'r', id: 'toast', s: 'breakfast', p: true }];
  await page.evaluate(([r, p, t, tm]) => {
    localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: r }));
    const c = JSON.parse(localStorage.getItem('ironlog:config/main') || '{}');
    localStorage.setItem('ironlog:config/main', JSON.stringify({ ...c, diet: { plan: { [t]: p, [tm]: p } } }));
  }, [recipes, planned, TODAY, TOMORROW]);
  await page.reload();
  await openNutrition(page);
};
const fix = page => page.locator('.wb-fix', { hasText: 'protein' });
const cfgDiet = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:config/main') || '{}').diet);

test('the breakfast hint suggests a breakfast food, not the dinner one', async ({ page }) => {
  await seed(page);
  await expect(fix(page).first()).toContainText('Eggs');
  await expect(fix(page).first()).not.toContainText('Braised beef');
});

test('switching Breakfast off in Manage hides its hints on every day and survives a reload', async ({ page }) => {
  await seed(page);
  await expect(page.getByRole('group', { name: 'Breakfast plate check' }).first()).toBeVisible();
  const sheet = await openManage(page);
  await sheet.getByRole('checkbox', { name: 'Breakfast' }).uncheck();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('group', { name: 'Breakfast plate check' })).toHaveCount(0);
  await expect(fix(page)).toHaveCount(0);
  expect((await cfgDiet(page)).hintsOff).toEqual(['breakfast']);
  await page.reload();
  await openNutrition(page);
  await expect(page.getByRole('group', { name: 'Breakfast plate check' })).toHaveCount(0);
  const again = await openManage(page);
  await expect(again.getByRole('checkbox', { name: 'Breakfast' })).not.toBeChecked();
  await expect(again.getByRole('checkbox', { name: 'Dinner' })).toBeChecked();
});

test('the × hides a breakfast hint for that day only', async ({ page }) => {
  await seed(page);
  const plates = page.getByRole('group', { name: 'Breakfast plate check' });
  const before = await plates.count();
  expect(before).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Hide plate hint for Breakfast today' }).first().click();
  await expect(plates).toHaveCount(before - 1);
  const diet = await cfgDiet(page);
  expect(Object.keys(diet.hintSkips)).toHaveLength(1);
  await page.reload();
  await openNutrition(page);
  await expect(plates).toHaveCount(before - 1); // still hidden after a reload, and the other days still show it
});

test('Manage plate hints have no accessibility violations and the × is 44 px on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  const x = page.getByRole('button', { name: 'Hide plate hint for Breakfast today' }).first();
  await expect(x).toBeVisible();
  const b = await x.boundingBox();
  expect(b.width).toBeGreaterThanOrEqual(43.5);
  expect(b.height).toBeGreaterThanOrEqual(43.5);
  const sheet = await openManage(page);
  const axe = await new AxeBuilder({ page }).include('.nbsheet').analyze();
  expect(axe.violations).toEqual([]);
  await expect(sheet.getByRole('group', { name: 'Plate hints' })).toBeVisible();
});
