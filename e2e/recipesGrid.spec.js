import { test, expect } from './fixtures.js';

// Recipes as a card grid with the filter chips on one row (brief recipes-card-grid). The badge text is a node test (recipeList.test.ts); this covers layout:
// the column count at each width, one filter row on a wide screen, wrapping on a phone, and that a card still opens its recipe.
const cats = ['protein', 'carbs', 'sides', 'sauces', 'breakfast', 'dessert', 'drinks', 'other'];
const items = Array.from({ length: 12 }, (_, i) => ({
  id: `r${i}`, n: `Recipe ${String(i).padStart(2, '0')}`, cat: cats[i % cats.length], tags: i % 3 === 0 ? ['meal prep'] : undefined, servings: 2, minutes: 10 + i, kcal: 300 + i * 20, p: 20 + i, c: 30, f: 10,
  ing: [{ n: 'Salt', amt: '1 tsp' }, { n: 'Rice', amt: '1 cup' }], steps: ['Cook.'],
}));
const openRecipes = async page => {
  await page.evaluate(list => localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: list })), items);
  await page.reload();
  await page.click('#tab-daily');
  await page.click('#daily-recipes');
  await expect(page.locator('.rc-cards li')).toHaveCount(12);
};
const columns = page => page.locator('.rc-cards li').evaluateAll(els => new Set(els.map(e => Math.round(e.getBoundingClientRect().left))).size); // cards sharing a left edge are one column
const tops = page => page.evaluate(() => [...document.querySelectorAll('.rc-filterbar > *')].map(el => Math.round(el.getBoundingClientRect().top)));

for (const [w, h, cols] of [[1920, 1080, 2], [1280, 800, 2], [768, 1024, 2], [375, 812, 1]]) {
  test(`Mine shows ${cols} list column${cols > 1 ? 's' : ''} at ${w} px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openRecipes(page);
    expect(await columns(page)).toBe(cols);
    const cards = await page.locator('.rc-cards li').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().width)));
    expect(Math.max(...cards) - Math.min(...cards)).toBeLessThanOrEqual(1); // equal-width cards
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); // no sideways scroll
  });
}

test('at 1920 px the chip groups and Sort share one row, with Sort at the right end', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openRecipes(page);
  const t = await tops(page);
  expect(t.length).toBeGreaterThanOrEqual(4); // Category, Tags, Nutrition, Sort
  expect(Math.max(...t) - Math.min(...t)).toBeLessThanOrEqual(8);
  const sort = await page.locator('.rc-filterbar .rc-sort').boundingBox(), bar = await page.locator('.rc-filterbar').boundingBox();
  expect(sort.x + sort.width).toBeGreaterThan(bar.x + bar.width - 4);
  const list = await page.locator('.rc-cards').boundingBox();
  expect(list.y).toBeLessThan(600); // was about 600 px down before the chip rows shared one line; the type tabs and the Filters button now sit above the list too (brief recipes-find-type-tabs)
});

test('at 375 px the filter groups wrap and stay inside the screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openRecipes(page);
  const t = await tops(page);
  expect(new Set(t).size).toBeGreaterThan(1); // wraps: the shorter groups (the Category pill, Can make and Manage) may share a row now that Category is a dropdown
  expect(await page.evaluate(() => [...document.querySelectorAll('.rc-filterbar button, .rc-filterbar select')].every(b => b.getBoundingClientRect().right <= innerWidth))).toBe(true);
});

test('a card opens its recipe and Back returns to the grid', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openRecipes(page);
  await page.locator('.rc-row', { hasText: 'Recipe 05' }).click();
  await expect(page).toHaveURL(/#\/daily\/recipes\/mine$/);
  await page.goBack();
  await expect(page.locator('.rc-cards li')).toHaveCount(12);
});
