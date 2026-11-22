import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { openSection } from './recipesNav.js';

// Recipes find: the Made / Store-bought sections, Recent and favorites, + New, the Filters disclosure and the list beside its detail (briefs recipes-find-type-tabs, foods-made-and-store-bought). The section rules, counts and
// recent order are node tests (foodSections.test.ts, recipeRecent.test.ts); this covers what they cannot: the real list, the pane at four widths, Back, the menu and the stars.
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

test('the sections list their own items with counts, search works across them, and an empty section says what to do', async ({ page }) => {
  await open(page); // nothing has no steps and Meals is empty, so Foods opens on Recipes
  await expect(page.locator('#recipes-sec-recipes')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#recipes-sec-meals')).toHaveText('Meals0');
  await expect(page.locator('#recipes-sec-recipes')).toHaveText('Recipes4'); // anything with steps, whatever it is used as
  await expect(page.locator('#recipes-sec-library')).toHaveText('Library'); // no count before the library has loaded
  expect((await titles(page)).sort()).toEqual(['Chicken bowl', 'Lemon cake', 'Lemonade', 'Lentil soup']);
  await expect(page.locator('.rc-cards li', { hasText: 'Lentil soup' }).locator('.rc-typetag')).toHaveText('Meal + Ingredient');
  await openSection(page, 'ingredients');
  await expect(page.locator('#recipes-sec-ingredients')).toHaveText('Ingredients1'); // Eggs is typed Ingredient
  await expect(page.locator('#recipes-sec-ready')).toHaveText('Ready to eat1');
  await expect(page.locator('#recipes-sec-drinks')).toHaveText('Drinks1');
  expect((await titles(page)).sort()).toEqual(['Eggs']);
  await page.click('#recipes-sec-ready');
  expect((await titles(page)).sort()).toEqual(['Protein bar']);
  await page.click('#recipes-sec-drinks');
  expect((await titles(page)).sort()).toEqual(['Oat milk']);
  await expect(page.locator('.rc-cards li', { hasText: 'Oat milk' }).locator('.rc-typetag')).toHaveText('Drink');
  await openSection(page, 'recipes');
  await page.getByLabel('Search recipes').fill('lem');
  expect((await titles(page)).sort()).toEqual(['Lemon cake', 'Lemonade']);
  await expect(page.locator('#recipes-sec-recipes')).toHaveText('Recipes2'); // the counts follow the search
  await expect(page.locator('#recipes-sec-meals')).toHaveText('Meals0');
  await expect(page.locator('#recipes-group-store')).toContainText('0 matches'); // the other group says how many match
  await openSection(page, 'ready');
  await expect(page.locator('#recipes-empty')).toContainText('Clear the search');
  await page.getByLabel('Search recipes').fill('');
  await expect(page.locator('#recipes-empty')).toHaveCount(0);
});

test('a section with nothing in it names the next step', async ({ page }) => {
  await open(page, [rc('soup', 'Lentil soup', 'protein')]);
  await openSection(page, 'meals');
  await expect(page.locator('#recipes-empty')).toContainText('a recipe with no steps is a meal');
  await openSection(page, 'drinks');
  await expect(page.locator('#recipes-empty')).toContainText('No drinks yet');
  await openSection(page, 'ready');
  await expect(page.locator('#recipes-empty')).toContainText('Add a food');
});

test('Filters is closed at first, and what is under it still filters and keeps the counts honest', async ({ page }) => {
  await open(page);
  await expect(page.locator('#recipes-filters')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByLabel('Category', { exact: true })).toBeHidden();
  await page.click('#recipes-filters');
  await expect(page.getByLabel('Category', { exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Tags', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Nutrition', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Can make' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Manage filters' })).toBeVisible();
  await expect(page.getByLabel('Sort')).toBeVisible();
  await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Protein' });
  expect((await titles(page)).sort()).toEqual(['Chicken bowl', 'Lentil soup']);
  await expect(page.locator('#recipes-sec-recipes')).toHaveText('Recipes2');
  await expect(page.locator('#recipes-sec-meals')).toHaveText('Meals0');
  await page.click('#recipes-filters');
  await expect(page.getByLabel('Category', { exact: true })).toBeHidden();
  expect((await titles(page)).sort()).toEqual(['Chicken bowl', 'Lentil soup']); // a hidden filter still applies
});

// The star is in the recipe's own header (brief recipe-star-placement): open the recipe, press it, come back to the list.
async function starInDetail(page, name, verb = 'Star') {
  await page.locator('.rc-row', { hasText: name }).first().click();
  const star = page.getByRole('button', { name: `${verb} ${name}` });
  const box = await star.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(43.5);
  expect(box.height).toBeGreaterThanOrEqual(43.5);
  await star.click();
  await expect(page.getByRole('button', { name: `${verb === 'Star' ? 'Unstar' : 'Star'} ${name}` })).toHaveAttribute('aria-pressed', verb === 'Star' ? 'true' : 'false');
  const back = page.getByRole('button', { name: 'Back', exact: true });
  if (await back.isVisible()) await back.click(); // from 1280 px the detail sits beside the list and has no Back
}
const favMark = (page, name) => page.locator('.rc-row', { hasText: name }).locator('.rc-favmark');

test('a star persists after a reload, starred recipes lead the Recent pill, and a row in it opens its recipe', async ({ page }) => {
  await open(page);
  await expect(page.locator('#recipes-recent')).toHaveCount(0); // nothing starred, logged or opened yet
  await expect(page.locator('.rc-star')).toHaveCount(0); // no star on a list row: it sat over Log and the at-home count
  await openSection(page, 'drinks');
  await starInDetail(page, 'Oat milk');
  await openSection(page, 'recipes');
  await starInDetail(page, 'Lemon cake');
  await expect(favMark(page, 'Lemon cake')).toBeVisible(); // a small mark after the name, not a button
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-recipes');
  await openSection(page, 'recipes');
  await page.click('#recipes-recent');
  await expect(page.locator('#recipes-recent')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#recipes-sec-recipes')).toHaveAttribute('aria-pressed', 'false');
  await expect(await titles(page)).toEqual(['Lemon cake']); // Recent is per section: Oat milk is in Drinks
  await openSection(page, 'drinks');
  await page.click('#recipes-recent');
  await expect(await titles(page)).toEqual(['Oat milk']);
  await page.locator('.rc-row', { hasText: 'Oat milk' }).click();
  await expect(page.getByRole('heading', { name: 'Oat milk' })).toBeVisible();
  await page.goBack();
  await starInDetail(page, 'Oat milk', 'Unstar');
  await expect(favMark(page, 'Oat milk')).toHaveCount(0);
  await openSection(page, 'recipes');
  await starInDetail(page, 'Lemon cake', 'Unstar');
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
    await openSection(page, 'drinks');
    await page.locator('.rc-row', { hasText: 'Oat milk' }).click();
    await expect(pane.getByRole('heading', { level: 2 })).toContainText('Oat milk');
    expect(await hash(page)).toBe('#/daily/recipes/drinks'); // the pane is not a screen; the address is the section
    const box = async el => el.boundingBox();
    const list = await box(page.locator('.rc-cards')), side = await box(pane);
    expect(side.x).toBeGreaterThan(list.x + list.width - 1); // beside, not below
    await expect(pane.getByRole('button', { name: 'Back', exact: true })).toBeHidden();
    await pane.getByRole('button', { name: 'More actions' }).click();
    await pane.getByRole('button', { name: /Delete the food Oat milk/ }).click();
    await pane.getByRole('button', { name: /Delete the food Oat milk|Tap again to delete/ }).click();
    await expect(page.locator('.rc-row', { hasText: 'Oat milk' })).toHaveCount(0);
    await expect(page.locator('#recipes-empty')).toContainText('No drinks yet');
    await openSection(page, 'recipes');
    await page.locator('.rc-row', { hasText: 'Lemon cake' }).click();
    await pane.getByRole('button', { name: 'More actions' }).click();
    await pane.getByRole('button', { name: /Delete the recipe Lemon cake/ }).click();
    await pane.getByRole('button', { name: /Delete the recipe Lemon cake|Tap again to delete/ }).click();
    await expect(pane.getByRole('heading', { level: 2 })).toContainText('Chicken bowl'); // a deleted pick shows the list's first item
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
    await expect.poll(() => hash(page)).toBe('#/daily/recipes/recipes');
    await expect(page.locator('.rc-cards li')).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('+ New offers every way to add and each opens its flow', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('ironlog:session/admin', 'true'); });
  await open(page);
  const menu = page.locator('#recipes-new-list');
  await page.click('#recipes-new');
  await expect(menu.getByRole('button')).toHaveText([/Recipe or meal/, /Add a food/]); // one entry for a food: scanning starts from its form
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(page.locator('#recipes-new')).toBeFocused(); // Escape hands focus back to + New
  await page.click('#recipes-new'); await menu.getByRole('button', { name: 'Recipe or meal' }).click();
  await expect(page.getByRole('heading', { name: 'New recipe' })).toBeVisible();
  await page.goBack();
  await page.click('#recipes-new'); await menu.getByRole('button', { name: 'Add a food' }).click();
  await expect(page.getByRole('heading', { name: 'New food' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Scan barcode' })).toHaveCount(0); // the form opens as it is; no camera sheet over it
  await expect(page.locator('#dt-scan-barcode')).toBeVisible(); // the scan starts here
  await page.goBack();
  await openSection(page, 'library');
  await expect(page.locator('#recipes-sec-library')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#recipes-new')).toBeVisible(); // + New is there in every section
  await openSection(page, 'recipes');
});

for (const [w, h] of [[1440, 900], [375, 812]]) {
  test(`the sections, chips, menu, Filters and stars have no accessibility violations and 44 px targets at ${w} px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await open(page, items, 'auto');
    await starInDetail(page, 'Lemonade');
    await expect(favMark(page, 'Lemonade')).toBeVisible();
    await page.click('#recipes-filters');
    await page.click('#recipes-new');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    const small = await page.locator('.fs-group, .rc-tabs button, #recipes-new, #recipes-filters, .rc-newlist button, .rc-chips button, .rc-filterbar select, .fselx').evaluateAll(els => els.filter(e => e.getBoundingClientRect().height < 43.5 && e.getBoundingClientRect().height > 0).map(e => e.textContent));
    expect(small).toEqual([]);
  });
}
