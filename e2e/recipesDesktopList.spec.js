import { test, expect } from './fixtures.js';

// Recipes on a desktop, the list half (brief recipes-desktop-layouts, 2b): one list column beside the pane at 1280 px and two at 1920, after Save landing on the list with the recipe open,
// the view kept while another Daily section is open, and the signed-out Library prompt. Column positions cannot be seen by a node test; the kept-state rules are in recipesViewState.test.ts.
const rc = (id, n, cat, extra = {}) => ({ id, n, cat, ing: [{ n: 'Rice' }], steps: ['Cook.'], servings: 2, kcal: 300, p: 20, ...extra });
const items = [rc('soup', 'Lentil soup', 'protein'), rc('cake', 'Lemon cake', 'dessert'), rc('bowl', 'Chicken bowl', 'protein'), rc('rice', 'Rice bowl', 'sides'), rc('fish', 'Baked fish', 'protein'), rc('stew', 'Beef stew', 'protein')];
const open = async (page, size) => {
  await page.setViewportSize(size);
  await page.addInitScript(list => { if (localStorage.getItem('ironlog:recipes/main') === null) localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: list })); localStorage.setItem('ironlog:sort:recipes-detail', 'auto'); localStorage.setItem('ironlog:sort:recipes-filters', 'closed'); }, items);
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-recipes');
  await expect(page.locator('.rc-row').first()).toBeVisible();
};
const pane = page => page.getByRole('complementary', { name: 'Recipe detail' });
const xs = async page => (await page.locator('.rc-item').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().x)))).filter((v, i, a) => a.indexOf(v) === i);

test('beside the pane the list is one column at 1280 px and two at 1920 px, each Log button on its row\'s right edge', async ({ page }) => {
  await open(page, { width: 1280, height: 800 });
  await expect(pane(page)).toBeVisible();
  expect(await xs(page)).toHaveLength(1);
  await page.setViewportSize({ width: 1920, height: 1080 });
  expect(await xs(page)).toHaveLength(2);
  const edges = await page.locator('.rc-item').evaluateAll(els => els.map(e => ({ col: Math.round(e.getBoundingClientRect().x), log: Math.round(e.querySelector('.rc-log').getBoundingClientRect().right) })));
  for (const col of new Set(edges.map(e => e.col))) expect(new Set(edges.filter(e => e.col === col).map(e => e.log)).size).toBe(1); // one right edge per column
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('after Save on a wide screen the list shows with the saved recipe open in the pane', async ({ page }) => {
  await open(page, { width: 1280, height: 800 });
  await page.locator('.rc-row', { hasText: 'Beef stew' }).click();
  await pane(page).getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Beef stew deluxe');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.locator('.rc-row', { hasText: 'Beef stew deluxe' })).toBeVisible(); // the list is back
  await expect(pane(page).getByRole('heading', { level: 2 })).toContainText('Beef stew deluxe');
  await expect(page.locator('.rc-item.current')).toContainText('Beef stew deluxe');
});

test('after Save on a phone the recipe\'s page opens', async ({ page }) => {
  await open(page, { width: 375, height: 812 });
  await page.locator('.rc-row', { hasText: 'Beef stew' }).click();
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Beef stew deluxe');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByRole('button', { name: 'Back to recipes' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2 })).toContainText('Beef stew deluxe');
});

test('the search, type tab and open recipe are kept while Groceries is open, and a reload clears them', async ({ page }) => {
  await open(page, { width: 1280, height: 800 });
  await page.getByLabel('Search recipes').fill('bowl');
  await page.click('#recipes-tab-meals');
  await page.click('#recipes-tab-all');
  await page.locator('.rc-row', { hasText: 'Rice bowl' }).click();
  await page.click('#daily-grocery');
  await expect(page.locator('#recipes-h')).toHaveCount(0);
  await page.click('#daily-recipes');
  await expect(page.getByLabel('Search recipes')).toHaveValue('bowl');
  await expect(page.locator('.rc-item')).toHaveCount(2);
  await expect(page.locator('.rc-item.current')).toContainText('Rice bowl');
  await expect(pane(page).getByRole('heading', { level: 2 })).toContainText('Rice bowl');
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-recipes');
  await expect(page.getByLabel('Search recipes')).toHaveValue('');
  await expect(page.locator('.rc-item')).toHaveCount(6);
});

test('the Library signed out shows one Sign in prompt and no search box or filters', async ({ page }) => {
  await open(page, { width: 1280, height: 800 });
  await page.click('#recipes-library');
  await expect(page.locator('#recipes-library-signin')).toContainText('Sign in to browse the recipe library.');
  await expect(page.locator('#recipes-library-signin').getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByLabel('Search recipes')).toHaveCount(0);
  await expect(page.locator('#recipes-filters')).toHaveCount(0);
  await expect(page.locator('.rc-tabs')).toHaveCount(0);
  await page.click('#recipes-mine');
  await expect(page.getByLabel('Search recipes')).toBeVisible();
});
