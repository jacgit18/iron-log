import { test, expect } from './fixtures.js';

// The compact Recipes list (brief recipes-list-compact): where the first row starts, the Recent pill, the one right-hand slot and the two columns.
// Positions and the slot cannot be seen by a node test; what the Recent pill lists and which rows are loggable are node tests (recipeRows.test.ts).
const rc = (id, n, cat, extra = {}) => ({ id, n, cat, ing: [{ n: 'Rice' }], steps: ['Cook.'], servings: 2, kcal: 300, p: 20, ...extra });
const items = [
  rc('soup', 'Lentil soup', 'protein', { fav: true }), rc('cake', 'Lemon cake', 'dessert'), rc('bowl', 'Chicken bowl', 'protein'),
  rc('egg', 'Eggs', 'ready', { type: 'ingredient', ing: [], steps: [] }), rc('milk', 'Oat milk', 'ready', { type: 'drink', ing: [], steps: [] }),
  rc('lem', 'Lemonade', 'drinks', { uses: ['ingredient'] }), rc('bar', 'Protein bar', 'ready', { type: 'ready', ing: [], steps: [] }),
  rc('rice', 'Rice bowl', 'sides'), rc('fish', 'Baked fish', 'protein'),
];
const open = async (page, size) => {
  await page.setViewportSize(size);
  await page.addInitScript(list => { if (localStorage.getItem('ironlog:recipes/main') === null) localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: list })); localStorage.setItem('ironlog:sort:recipes-detail', 'closed'); localStorage.setItem('ironlog:sort:recipes-filters', 'closed'); }, items);
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-recipes');
  await expect(page.locator('.rc-row').first()).toBeVisible();
};
const noSideScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test('on a phone the first recipe row starts above 340 px and nothing scrolls sideways', async ({ page }) => {
  await open(page, { width: 375, height: 812 });
  const box = await page.locator('.rc-item').first().boundingBox();
  expect(box.y).toBeLessThan(340);
  expect(await noSideScroll(page)).toBe(true);
  // title, search and the pill row are the only things above the list
  const pills = await page.locator('.rc-tabs').boundingBox();
  expect(pills.height).toBeLessThan(60);
});

test('the Recent pill lists the favourites and recent recipes, and a row in it opens', async ({ page }) => {
  await open(page, { width: 375, height: 812 });
  await expect(page.locator('#recipes-recent')).toHaveAttribute('aria-pressed', 'false');
  await page.click('#recipes-recent');
  await expect(page.locator('.rc-item')).toHaveCount(1); // Lentil soup is starred; nothing was logged or opened yet
  await expect(page.locator('#recipes-tab-all')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('.rc-row', { hasText: 'Lentil soup' }).click();
  await expect(page.getByRole('heading', { name: /Lentil soup/ })).toBeVisible();
  await page.getByRole('button', { name: 'Back to recipes' }).click();
  await page.click('#recipes-recent');
  await page.locator('#recipes-tab-meals').click();
  await expect(page.locator('#recipes-recent')).toHaveAttribute('aria-pressed', 'false'); // a type pill takes over from Recent
  expect(await page.locator('.rc-item').count()).toBeGreaterThan(1);
});

test('every row has its action at the same right edge: Log, or an arrow', async ({ page }) => {
  await open(page, { width: 375, height: 812 });
  const log = await page.locator('.rc-item', { hasText: 'Lentil soup' }).locator('.rc-log').boundingBox();
  const go = await page.locator('.rc-item', { hasText: 'Eggs' }).locator('.rc-go').boundingBox();
  expect(log).not.toBeNull();
  expect(go).not.toBeNull();
  expect(Math.abs(log.x + log.width - (go.x + go.width))).toBeLessThan(0.5);
  await expect(page.locator('.rc-item', { hasText: 'Eggs' }).getByRole('button', { name: 'Log' })).toHaveCount(0); // an ingredient has nothing to log
  await page.locator('.rc-item', { hasText: 'Eggs' }).locator('.rc-row').click(); // the arrow row opens the item
  await expect(page.getByRole('heading', { name: /Eggs/ })).toBeVisible();
});

for (const [w, h, cols] of [[375, 812, 1], [768, 1024, 2], [1280, 800, 2], [1920, 1080, 2]]) {
  test(`at ${w} px the list has ${cols === 1 ? 'one column' : 'two columns'} and no sideways scroll`, async ({ page }) => {
    await open(page, { width: w, height: h });
    const [a, b] = await Promise.all([page.locator('.rc-item').nth(0).boundingBox(), page.locator('.rc-item').nth(1).boundingBox()]);
    if (cols === 2) { expect(Math.abs(a.y - b.y)).toBeLessThan(1); expect(b.x).toBeGreaterThan(a.x + a.width - 1); } else expect(b.y).toBeGreaterThan(a.y + a.height - 1);
    expect(await noSideScroll(page)).toBe(true);
  });
}
