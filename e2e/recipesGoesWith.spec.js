import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// Goes with and Make a meal (brief recipes-goes-with). The pairing rules and the cleaner are node tests (recipePairs.test.ts); this covers the real
// detail page: adding a partner, seeing it from the other side, Make a meal opening a linked meal with rolled-up numbers, Remove, and the 3 cap.
const openRecipes = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); };
const seed = async page => {
  const mk = (id, n, cat, kcal, p) => ({ id, n, cat, ing: [{ n: 'x' }], steps: ['Cook.'], kcal, p });
  const items = [mk('chili', 'Chili', 'protein', 400, 30), mk('rice', 'Rice', 'carbs', 200, 4), mk('beans', 'Beans', 'sides', 150, 9), mk('salad', 'Salad', 'sides', 80, 2), mk('bread', 'Bread', 'carbs', 120, 4)];
  await page.evaluate(list => localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: list })), items);
  await page.reload();
  await openRecipes(page);
};
const open = (page, name) => page.locator('.rc-row', { hasText: name }).first().click();
const goes = page => page.getByRole('region', { name: 'Goes with' });
const back = async page => { const b = page.getByRole('button', { name: 'Back to recipes' }); if (await b.isVisible()) await b.click(); };

test('pairing is saved on both recipes, shown from either, and Remove takes it off both', async ({ page }) => {
  await seed(page);
  await open(page, 'Chili');
  await expect(goes(page)).toContainText('Nothing yet');
  await goes(page).getByLabel('Add a recipe it goes with').selectOption({ label: 'Rice' });
  await expect(goes(page).getByRole('button', { name: 'Rice', exact: true })).toBeVisible();
  await back(page);
  await open(page, 'Rice');
  await expect(goes(page).getByRole('button', { name: 'Chili', exact: true })).toBeVisible(); // seen from the other side
  await goes(page).getByRole('button', { name: 'Remove Chili from Goes with' }).click();
  await expect(goes(page)).toContainText('Nothing yet');
  await back(page);
  await open(page, 'Chili');
  await expect(goes(page)).toContainText('Nothing yet'); // and from the first one
});

test('Make a meal builds a linked meal whose numbers are the two parts added up', async ({ page }) => {
  await seed(page);
  await open(page, 'Chili');
  await goes(page).getByLabel('Add a recipe it goes with').selectOption({ label: 'Rice' });
  await goes(page).getByRole('button', { name: 'Make a meal of Chili with Rice' }).click();
  await expect(page.getByRole('heading', { name: /Chili with Rice/ })).toBeVisible();
  await expect(page.getByText('Per portion: 600 kcal · 34 g protein')).toBeVisible();
});

test('a recipe goes with at most three, then asks to remove one', async ({ page }) => {
  await seed(page);
  await open(page, 'Chili');
  for (const n of ['Rice', 'Beans', 'Salad']) await goes(page).getByLabel('Add a recipe it goes with').selectOption({ label: n });
  await expect(goes(page).getByLabel('Add a recipe it goes with')).toHaveCount(0);
  await expect(goes(page)).toContainText('goes with 3 recipes');
  await goes(page).getByRole('button', { name: 'Remove Salad from Goes with' }).click();
  await expect(goes(page).getByLabel('Add a recipe it goes with')).toBeVisible();
});

test('Goes with has no accessibility violations and 44 px targets on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await seed(page);
  await open(page, 'Chili');
  await goes(page).getByLabel('Add a recipe it goes with').selectOption({ label: 'Rice' });
  const axe = await new AxeBuilder({ page }).include('.rc-goes').analyze();
  expect(axe.violations).toEqual([]);
  for (const b of await goes(page).getByRole('button').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(43.5);
});
