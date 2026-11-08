import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// Recipes find: type tabs, Recent and favorites, + New, the Filters disclosure and the list beside its detail (brief recipes-find-type-tabs). The tab rules, counts and
// recent order are node tests (recipeTabs.test.ts, recipeRecent.test.ts); this covers what they cannot: the real list, the pane at four widths, Back, the menu and the stars.
const rc = (id, n, cat, extra = {}) => ({ id, n, cat, ing: [{ n: 'Rice' }], steps: ['Cook.'], servings: 2, kcal: 300, p: 20, ...extra });
const items = [
  rc('soup', 'Lentil soup', 'protein'), rc('cake', 'Lemon cake', 'dessert'), rc('bowl', 'Chicken bowl', 'protein', { tags: ['dinner'] }),
  rc('egg', 'Eggs', 'ready', { type: 'ingredient', ing: [], steps: [] }), rc('bar', 'Protein bar', 'ready', { type: 'ready', ing: [], steps: [] }),
  rc('milk', 'Oat milk', 'ready', { type: 'drink', ing: [], steps: [] }), rc('lem', 'Lemonade', 'drinks'),
];
const seed = (page, list = items, detail = 'closed') => page.addInitScript(([l, d]) => { if (localStorage.getItem('ironlog:recipes/main') === null) localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: l })); localStorage.setItem('ironlog:sort:recipes-detail', d); localStorage.setItem('ironlog:sort:recipes-filters', 'closed'); }, [list, detail]);
const open = async (page, list, detail) => {
  await seed(page, list, detail);
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-recipes');
};
const titles = page => page.locator('.rc-cards .rc-title b').allTextContents();
const hash = page => page.evaluate(() => location.hash);

test('the tabs filter by type with counts, search works across them, and an empty tab says what to do', async ({ page }) => {
  await open(page);
  await expect(page.locator('#recipes-tab-all')).toHaveText('All7');
  await expect(page.locator('#recipes-tab-foods')).toHaveText('Foods2');
  await expect(page.locator('#recipes-tab-meals')).toHaveText('Meals3');
  await expect(page.locator('#recipes-tab-drinks')).toHaveText('Drinks2');
  await page.click('#recipes-tab-foods');
  expect((await titles(page)).sort()).toEqual(['Eggs', 'Protein bar']);
  await page.click('#recipes-tab-drinks');
  expect((await titles(page)).sort()).toEqual(['Lemonade', 'Oat milk']);
  await expect(page.locator('.rc-cards li', { hasText: 'Oat milk' }).locator('.rc-typetag')).toHaveText('Drink');
  await page.click('#recipes-tab-all');
  await expect(page.locator('.rc-cards li', { hasText: 'Lentil soup' }).locator('.rc-typetag')).toHaveText('Meal');
  await page.getByLabel('Search recipes').fill('lem');
  expect((await titles(page)).sort()).toEqual(['Lemon cake', 'Lemonade']);
  await expect(page.locator('#recipes-tab-all')).toHaveText('All2'); // the counts follow the search
  await expect(page.locator('#recipes-tab-foods')).toHaveText('Foods0');
  await page.click('#recipes-tab-foods');
  await expect(page.locator('#recipes-empty')).toContainText('Clear the search');
  await page.getByLabel('Search recipes').fill('');
  await expect(page.locator('#recipes-empty')).toHaveCount(0);
});

test('a tab with nothing in it names the next step', async ({ page }) => {
  await open(page, [rc('soup', 'Lentil soup', 'protein')]);
  await page.click('#recipes-tab-drinks');
  await expect(page.locator('#recipes-empty')).toContainText('No drinks yet');
  await page.click('#recipes-tab-foods');
  await expect(page.locator('#recipes-empty')).toContainText('Scan a food');
});

test('Filters is closed at first, and what is under it still filters and keeps the counts honest', async ({ page }) => {
  await open(page);
  await expect(page.locator('#recipes-filters')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('group', { name: 'Category' })).toBeHidden();
  await page.click('#recipes-filters');
  await expect(page.getByRole('group', { name: 'Category' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Tags', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Nutrition', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Can make' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Manage filters' })).toBeVisible();
  await expect(page.getByLabel('Sort')).toBeVisible();
  await page.getByRole('group', { name: 'Category' }).getByRole('button', { name: 'Protein' }).click();
  expect((await titles(page)).sort()).toEqual(['Chicken bowl', 'Lentil soup']);
  await expect(page.locator('#recipes-tab-meals')).toHaveText('Meals2');
  await expect(page.locator('#recipes-tab-drinks')).toHaveText('Drinks0');
  await page.click('#recipes-filters');
  await expect(page.getByRole('group', { name: 'Category' })).toBeHidden();
  expect((await titles(page)).sort()).toEqual(['Chicken bowl', 'Lentil soup']); // a hidden filter still applies
});

test('a star persists after a reload, starred recipes lead the Recent and favorites chips, and a chip opens its recipe', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('group', { name: 'Recent and favorites' })).toHaveCount(0); // nothing starred, logged or opened yet
  await page.getByRole('button', { name: 'Star Oat milk' }).click();
  await page.getByRole('button', { name: 'Star Lemon cake' }).click();
  await expect(page.getByRole('button', { name: 'Unstar Oat milk' })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-recipes');
  const chips = page.getByRole('group', { name: 'Recent and favorites' }).getByRole('button');
  await expect(chips).toHaveText(['Lemon cake', 'Oat milk']);
  await chips.nth(1).click();
  await expect(page.getByRole('heading', { name: 'Oat milk' })).toBeVisible();
  await page.goBack();
  await page.getByRole('button', { name: 'Unstar Oat milk' }).click();
  await page.getByRole('button', { name: 'Unstar Lemon cake' }).click();
  await expect(page.getByRole('button', { name: 'Star Oat milk' })).toBeVisible();
});

for (const [w, h] of [[1920, 1080], [1280, 800]]) {
  test(`at ${w} px the detail shows beside the list and a row swaps it`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await open(page, items, 'auto');
    const pane = page.getByRole('complementary', { name: 'Recipe detail' });
    await expect(pane).toBeVisible();
    await expect(pane.getByRole('heading', { level: 2 })).toHaveText('Chicken bowlCustom'); // the list's first item (by name) until one is picked
    await page.locator('.rc-row', { hasText: 'Lemon cake' }).click();
    await expect(pane.getByRole('heading', { level: 2 })).toHaveText('Lemon cakeCustom');
    await page.locator('.rc-row', { hasText: 'Oat milk' }).click();
    await expect(pane.getByRole('heading', { level: 2 })).toContainText('Oat milk');
    expect(await hash(page)).toBe('#/daily/recipes'); // the pane is not a screen
    const box = async el => el.boundingBox();
    const list = await box(page.locator('.rc-cards')), side = await box(pane);
    expect(side.x).toBeGreaterThan(list.x + list.width - 1); // beside, not below
    await expect(pane.getByRole('button', { name: 'Back to recipes' })).toBeHidden();
    await pane.getByRole('button', { name: /Delete the food Oat milk/ }).click();
    await pane.getByRole('button', { name: /Delete the food Oat milk|Tap again to delete/ }).click();
    await expect(page.locator('.rc-row', { hasText: 'Oat milk' })).toHaveCount(0);
    await expect(pane.getByRole('heading', { level: 2 })).toBeVisible(); // a deleted pick shows the list's first item
  });
}

for (const [w, h] of [[768, 1024], [375, 812]]) {
  test(`at ${w} px a row opens its page and Back returns to the list`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await open(page, items, 'auto');
    await expect(page.getByRole('complementary', { name: 'Recipe detail' })).toHaveCount(0);
    await page.locator('.rc-row', { hasText: 'Lemon cake' }).click();
    await expect.poll(() => hash(page)).toBe('#/daily/recipes/mine');
    await expect(page.getByRole('heading', { name: 'Lemon cake' })).toBeVisible();
    await page.goBack();
    await expect.poll(() => hash(page)).toBe('#/daily/recipes');
    await expect(page.locator('.rc-cards li')).toHaveCount(7);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('+ New offers every way to add and each opens its flow', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('ironlog:session/admin', 'true'); navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError')); });
  await open(page);
  const menu = page.locator('#recipes-new-list');
  await page.click('#recipes-new');
  await expect(menu.getByRole('button')).toHaveText([/Scan a food/, /Build a meal/, /Write a recipe/, /Browse the Library/, /Add a food by hand/]);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await page.click('#recipes-new'); await menu.getByRole('button', { name: 'Write a recipe' }).click();
  await expect(page.getByRole('heading', { name: 'New recipe' })).toBeVisible();
  await page.goBack();
  await page.click('#recipes-new'); await menu.getByRole('button', { name: 'Build a meal' }).click();
  await expect(page.getByRole('heading', { name: 'New recipe' })).toBeVisible();
  await page.goBack();
  await page.click('#recipes-new'); await menu.getByRole('button', { name: 'Add a food by hand' }).click();
  await expect(page.getByRole('heading', { name: 'New ready-made food' })).toBeVisible();
  await page.goBack();
  await page.click('#recipes-new'); await menu.getByRole('button', { name: 'Browse the Library' }).click();
  await expect(page.locator('#recipes-library')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#recipes-new')).toHaveCount(0); // the menu belongs to Mine
  await page.click('#recipes-mine');
  await page.click('#recipes-new'); await menu.getByRole('button', { name: 'Scan a food' }).click();
  await expect(page.getByRole('heading', { name: 'Scan barcode' })).toBeVisible(); // the barcode sheet opens over the ready-made form
  await expect(page.getByRole('heading', { name: 'New ready-made food' })).toBeVisible();
});

for (const [w, h] of [[1440, 900], [375, 812]]) {
  test(`the tabs, chips, menu, Filters and stars have no accessibility violations and 44 px targets at ${w} px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await open(page, items, 'auto');
    await page.getByRole('button', { name: 'Star Lemonade' }).click();
    await page.click('#recipes-filters');
    await page.click('#recipes-new');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    const small = await page.locator('.rc-tabs button, .rc-quick button, #recipes-new, #recipes-filters, .rc-newlist button, .rc-star, .rc-chips button').evaluateAll(els => els.filter(e => e.getBoundingClientRect().height < 43.5 && e.getBoundingClientRect().height > 0).map(e => e.textContent));
    expect(small).toEqual([]);
  });
}
