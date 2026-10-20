import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// The Daily row (Groceries, Nutrition, Medical, Recipes): Supplements is now called Nutrition, and Medical, Recipes and the Diet section inside
// Nutrition are admin-only for now. An account that is not an admin sees only Groceries and Nutrition, with no Diet.
const asAdmin = async page => { await page.evaluate(() => localStorage.setItem('ironlog:session/admin', 'true')); await page.reload(); };
const ids = page => page.locator('[aria-label="Daily section"] button').evaluateAll(b => b.map(x => x.id));

test('a regular account sees Groceries and Nutrition, with no Diet, Medical or Recipes', async ({ page }) => {
  await page.click('#tab-daily');
  await expect(page.locator('#daily-grocery')).toBeVisible();
  expect(await ids(page)).toEqual(['daily-grocery', 'daily-supplements']);
  await expect(page.locator('#daily-supplements')).toHaveText('Nutrition');
  await expect(page.getByRole('heading', { name: 'Diet' })).toHaveCount(0);
});

test('an admin also sees Medical and Recipes, and a Diet section inside Nutrition', async ({ page }) => {
  await asAdmin(page);
  await page.click('#tab-daily');
  await expect(page.locator('#daily-grocery')).toBeVisible();
  expect(await ids(page)).toEqual(['daily-grocery', 'daily-supplements', 'daily-medical', 'daily-recipes']);
  await expect(page.getByRole('heading', { name: 'Diet' })).toBeVisible(); // Nutrition opens first and holds it
  await page.click('#daily-recipes');
  await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible();
  await page.click('#daily-medical');
  await expect(page.getByRole('heading', { name: 'Medical' })).toBeVisible();
});

test('a saved view that is no longer allowed falls back to Nutrition', async ({ page }) => {
  await asAdmin(page);
  await page.click('#tab-daily'); await page.click('#daily-recipes');
  await page.evaluate(() => localStorage.removeItem('ironlog:session/admin'));
  await page.reload(); await page.click('#tab-daily');
  await expect(page.locator('#daily-supplements')).toHaveAttribute('aria-pressed', 'true');
});

test('Nutrition with Diet, Recipes and Medical have no accessibility violations', async ({ page }) => {
  await asAdmin(page);
  await page.click('#tab-daily');
  await expect(page.getByRole('heading', { name: 'Diet' })).toBeVisible();
  for (const view of [null, 'daily-recipes', 'daily-medical']) {
    if (view) await page.click(`#${view}`);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
});
