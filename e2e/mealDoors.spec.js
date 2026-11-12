import { test, expect } from './fixtures.js';

// Meal doors, tightened (owner-approved 2026-11-12). The recipe page's Goes with row offers "Make a meal" as a quiet text link (still a real button
// with a 44 px target) next to the two-tap Remove. The Nutrition Add food sheet's hide rule for "Save as a meal in Recipes" waits for PR 939
// (same files) and gets its tests here when it lands.
const seed = async page => {
  const mk = (id, n, cat, kcal, p) => ({ id, n, cat, ing: [{ n: 'x' }], steps: ['Cook.'], kcal, p });
  await page.evaluate(list => localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: list })), [mk('chili', 'Chili', 'protein', 400, 30), mk('rice', 'Rice', 'carbs', 200, 4)]);
  await page.reload();
  await page.click('#tab-daily');
  await page.click('#daily-recipes');
  await page.locator('.rc-row', { hasText: 'Chili' }).first().click();
  const goes = page.getByRole('region', { name: 'Goes with' });
  await goes.getByLabel('Add a recipe it goes with').selectOption({ label: 'Rice' });
  return goes;
};

test('Goes with: Make a meal is a quiet link that still makes the meal and opens it', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/');
  const goes = await seed(page);
  const make = goes.getByRole('button', { name: 'Make a meal of Chili with Rice' });
  await expect(make).toHaveText('Make a meal');
  const css = await make.evaluate(el => { const s = getComputedStyle(el); return { line: s.textDecorationLine, bg: s.backgroundColor, border: s.borderTopWidth }; });
  expect(css).toEqual({ line: 'underline', bg: 'rgba(0, 0, 0, 0)', border: '0px' });
  expect((await make.boundingBox()).height).toBeGreaterThanOrEqual(43.5);
  const row = goes.locator('.rc-goeslist li').first();
  expect((await row.boundingBox()).height).toBeLessThan(50); // name, link and Remove share one line on a phone
  await make.click();
  await expect(page.getByRole('heading', { name: /Chili with Rice/ })).toBeVisible();
  await expect(page.getByText('Per portion: 600 kcal · P 34 g')).toBeVisible();
});

test('Goes with: Remove still arms on the first tap and removes on the second', async ({ page }) => {
  await page.goto('/');
  const goes = await seed(page);
  const rm = goes.getByRole('button', { name: 'Remove Rice from Goes with' });
  await rm.click();
  await expect(rm).toHaveText('Tap again to remove');
  await expect(goes).not.toContainText('Nothing yet');
  await rm.click();
  await expect(goes).toContainText('Nothing yet');
});
