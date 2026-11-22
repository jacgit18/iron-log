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
  await page.getByRole('button', { name: 'Back', exact: true }).click();
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

const seedThree = async page => { // Cereal carries three combos, so its row has "+1 more"; the tag gives the test a filter to hold
  await seed(page);
  await page.evaluate(() => {
    const k = 'ironlog:recipes/main', d = JSON.parse(localStorage.getItem(k));
    d.items.find(r => r.id === 'cereal').tags = ['Quick'];
    for (const [id, n] of [['b2', 'Cereal bar'], ['b3', 'Cereal cup']]) d.items.push({ id, n, cat: 'other', servings: 1, ing: [{ n: 'Cereal', rid: 'cereal', q: 1 }], steps: [] });
    localStorage.setItem(k, JSON.stringify(d));
  });
  await page.reload();
  await openRecipes(page);
};
const chipsOf = item => item.locator('.rc-combochip:not(.more)');

test('"+N more" expands the rest of the chips in place and Show fewer folds them, touching no search, tab or filter; a tab change folds them', async ({ page }) => {
  await seedThree(page);
  await page.getByLabel('Search recipes').fill('Cereal');
  const tag = page.getByRole('group', { name: 'Tags', exact: true }).getByRole('button', { name: 'Quick' });
  await tag.click();
  const item = itemOf(page, 'Cereal');
  await expect(chipsOf(item)).toHaveCount(2);
  const more = item.getByRole('button', { name: '+1 more with Cereal' });
  await expect(more).toHaveText('+1 more');
  await more.click();
  await expect(chipsOf(item)).toHaveCount(3);
  const fewer = item.getByRole('button', { name: 'Show fewer with Cereal' });
  await expect(fewer).toHaveText('Show fewer');
  await expect(page.getByLabel('Search recipes')).toHaveValue('Cereal');
  await expect(tag).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#recipes-tab-all')).toHaveAttribute('aria-pressed', 'true');
  await fewer.click();
  await expect(chipsOf(item)).toHaveCount(2);
  await more.click();
  await expect(chipsOf(item)).toHaveCount(3);
  await page.locator('#recipes-tab-foods').click(); // the row is on Foods too: the tab change folds it
  await expect(chipsOf(item)).toHaveCount(2);
  await page.locator('#recipes-tab-all').click();
  await expect(chipsOf(item)).toHaveCount(2);
});

test('on a phone the expanded chips are still open after a combo is opened and Back', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await seedThree(page);
  const item = itemOf(page, 'Cereal');
  await item.getByRole('button', { name: '+1 more with Cereal' }).click();
  await chipsOf(item).nth(2).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(chipsOf(item)).toHaveCount(3);
});
