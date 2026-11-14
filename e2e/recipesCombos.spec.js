import { test, expect } from './fixtures.js';

// Combo chips (brief recipes-combo-chips). The rows rule and the counts are node tests (recipeCombos.test.ts); this covers what a unit test cannot:
// a chip is a real, separate tap target beside the row's button that opens the combo, Back returns to the list, and the Meals row names its parts.
const openRecipes = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); };
const seed = async page => {
  const food = (id, n, extra = {}) => ({ id, n, cat: 'ready', type: 'ready', ing: [{ n }], steps: [], kcal: 100, p: 2, c: 20, f: 1, servings: 1, ...extra });
  const items = [
    food('cereal', 'Cereal'), food('milk', 'Milk', { type: 'drink' }), food('rice', 'Rice'),
    { id: 'cwm', n: 'Cereal with Milk', cat: 'other', servings: 1, ing: [{ n: 'Cereal', rid: 'cereal', q: 1 }, { n: 'Milk', rid: 'milk', q: 1 }], steps: [] },
  ];
  await page.evaluate(list => { localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: list })); localStorage.setItem('ironlog:sort:recipes-detail', 'auto'); }, items); // the pane is on by this choice from 1280 px
  await page.reload();
  await openRecipes(page);
};
const itemOf = (page, name) => page.locator('.rc-item').filter({ has: page.locator('.rc-title b', { hasText: new RegExp(`^${name}$`) }) });
const rows = page => page.locator('.rc-item .rc-title b');

test('a combo is a chip on each part, not a row, on All', async ({ page }) => {
  await seed(page);
  await expect(rows(page)).toHaveText(['Cereal', 'Milk', 'Rice']);
  await expect(itemOf(page, 'Cereal').getByRole('button', { name: 'Open Cereal with Milk' })).toHaveText('with Milk');
  await expect(itemOf(page, 'Milk').getByRole('button', { name: 'Open Cereal with Milk' })).toHaveText('Cereal with Milk');
  await expect(itemOf(page, 'Rice').getByRole('button', { name: /Open/ })).toHaveCount(0);
  await expect(page.locator('#recipes-tab-all')).toContainText('3');
});

test('the chip is its own tap target outside the row button, opens the combo, and Back returns to the list', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await seed(page);
  const item = itemOf(page, 'Cereal');
  expect(await item.locator('.rc-row .rc-combochip').count()).toBe(0); // never nested in the row's button
  await item.getByRole('button', { name: 'Open Cereal with Milk' }).click();
  await expect(page.getByRole('heading', { name: /Cereal with Milk/ })).toBeVisible();
  await page.getByRole('button', { name: 'Back to recipes' }).click();
  await expect(rows(page)).toHaveText(['Cereal', 'Milk', 'Rice']);
});

test('on a desktop the chip opens the combo in the pane and the list keeps its rows', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await itemOf(page, 'Milk').getByRole('button', { name: 'Open Cereal with Milk' }).click();
  const pane = page.getByRole('complementary', { name: 'Recipe detail' });
  await expect(pane.getByRole('button', { name: 'Open Milk, food' })).toBeVisible(); // the combo's parts, which a food's own page does not list
  await expect(rows(page)).toHaveText(['Cereal', 'Milk', 'Rice']);
});

test('Meals lists the combo as its own row with its parts named', async ({ page }) => {
  await seed(page);
  await page.locator('#recipes-tab-meals').click();
  await expect(rows(page)).toHaveText(['Cereal with Milk']);
  await expect(itemOf(page, 'Cereal with Milk').locator('.rc-parts')).toHaveText('Cereal + Milk');
  await expect(page.locator('.rc-combochip')).toHaveCount(0);
});
