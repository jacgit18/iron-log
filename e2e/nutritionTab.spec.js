import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// The Daily row (Groceries, Nutrition, Medical, Recipes): Supplements is now called Nutrition, and Medical and the Diet section inside Nutrition
// is admin-only for now; Diet (inside Nutrition, ADR 086) and Recipes (ADR 084) are for everyone. An account that is not an admin sees Groceries, Nutrition and Recipes, with Diet inside Nutrition and no Medical.
const asAdmin = async page => { await page.evaluate(() => localStorage.setItem('ironlog:session/admin', 'true')); await page.reload(); };
const ids = page => page.locator('[aria-label="Daily section"] button').evaluateAll(b => b.map(x => x.id));

test('a regular account sees Groceries, Nutrition and Recipes, with Diet inside Nutrition and no Medical', async ({ page }) => {
  await page.click('#tab-daily');
  await expect(page.locator('#daily-grocery')).toBeVisible();
  expect(await ids(page)).toEqual(['daily-grocery', 'daily-supplements', 'daily-recipes']);
  await expect(page.locator('#daily-supplements')).toHaveText('Nutrition');
  await expect(page.getByRole('heading', { name: 'Diet' })).toBeVisible();
});

test('an admin also sees Medical', async ({ page }) => {
  await asAdmin(page);
  await page.click('#tab-daily');
  await expect(page.locator('#daily-grocery')).toBeVisible();
  expect(await ids(page)).toEqual(['daily-grocery', 'daily-supplements', 'daily-medical', 'daily-recipes']);
  await page.click('#daily-recipes');
  await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible();
  await page.click('#daily-medical');
  await expect(page.getByRole('heading', { name: 'Medical' })).toBeVisible();
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
