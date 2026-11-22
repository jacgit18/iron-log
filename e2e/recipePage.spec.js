import { test, expect } from './fixtures.js';
import { deleteEaten, openNutrition, todayCol } from './nutritionBoardHelpers.js';

// The recipe page after the log form left (brief recipe-page-after-log): a summary strip, one action row (Log, Plan…, Add N missing to Shopping), "Cook for N" always in the Ingredients heading, nothing fixed over the tab bar.
// What the strip says and which button shows are node tests (recipeSummary.test.ts); this covers the wiring and the layout, which need a real page. The fixed clock in fixtures.js is Thursday 2026-09-24.
const long = Array.from({ length: 24 }, (_, i) => ({ amt: '1 cup', n: `ingredient ${i + 1}` }));
const stew = { id: 'stew', n: 'Long stew', cat: 'protein', servings: 4, kcal: 400, p: 30, ing: long, steps: ['Cook it.', 'Eat it.'] };
const bare = { id: 'bare', n: 'No numbers stew', cat: 'protein', servings: 2, ing: [{ amt: '1 cup', n: 'flour' }], steps: ['Cook it.'] };
const food = (id, n, extra) => ({ id, n, cat: 'ready', type: 'ingredient', ing: [], steps: [], ...extra });
const seed = async (page, list, extra = {}) => {
  await page.addInitScript(([l, x]) => {
    if (localStorage.getItem('ironlog:recipes/main') === null) localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: l }));
    for (const [k, v] of Object.entries(x)) if (localStorage.getItem(k) === null) localStorage.setItem(k, JSON.stringify(v));
  }, [list, extra]);
  await page.reload(); // the fixture has already loaded the page once
};
const open = async (page, name = 'Long stew') => { await page.click('#tab-daily'); await page.click('#daily-recipes'); await page.locator('.rc-row', { hasText: name }).click(); await expect(page.locator('#rc-h')).toHaveText(new RegExp(name)); };
const box = (page, sel) => page.locator(sel).first().boundingBox();
const strip = page => page.locator('.rc-strip');

test('the strip shows the per-serving numbers and "Not eaten yet", and at-home only when there are inventory items', async ({ page }) => {
  await seed(page, [stew]);
  await open(page);
  await expect(strip(page).locator('li')).toHaveCount(2); // per serving, last eaten: separate small boxes
  await expect(strip(page).getByText('400 kcal', { exact: true })).toBeVisible();
  await expect(strip(page).getByText('P 30 g per serving')).toBeVisible();
  await expect(strip(page).getByText('Not eaten yet')).toBeVisible();
  await expect(strip(page)).not.toContainText('at home'); // no inventory items yet
  await expect(page.getByText('Add items under Groceries, Inventory to see what you have.')).toBeVisible();
});

test('with inventory items the strip says how many ingredients are at home', async ({ page }) => {
  await seed(page, [stew], { 'ironlog:grocery/main': { stores: ['x'], items: [{ id: 'g1', n: 'Flour', store: 'x', qty: 1, every: true, out: false }], groups: [] } });
  await open(page);
  await expect(strip(page).locator('li')).toHaveCount(3);
  await expect(strip(page).getByText('0 of 24 at home')).toBeVisible();
  await expect(strip(page).getByText('24 missing')).toBeVisible();
});

test('the Log button logs the usual portion in one tap, reads Added until Undo, and Undo removes only that entry', async ({ page }) => {
  await seed(page, [{ ...stew, usual: 2 }]);
  await open(page);
  await page.getByRole('button', { name: 'Log', exact: true }).click();
  await expect(page.getByText('Logged Long stew, 2 portions, for today.')).toBeVisible();
  const added = page.getByRole('button', { name: 'Added', exact: true });
  await expect(added).toBeDisabled(); // a second tap cannot log twice
  await expect(page.getByRole('button', { name: 'Log', exact: true })).toHaveCount(0);
  await expect(strip(page)).toContainText('Last eaten today');
  await expect(strip(page)).toContainText('Usual 2 portions');
  await openNutrition(page);
  await expect(todayCol(page).locator('.nb-eat')).toHaveCount(1);
  await expect(todayCol(page).locator('.nb-eat')).toContainText('800 kcal');
  await open(page); // leaving the page resets the button
  await expect(page.getByRole('button', { name: 'Log', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Log', exact: true }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: 'Log', exact: true })).toBeVisible();
  await openNutrition(page);
  await expect(todayCol(page).locator('.nb-eat')).toHaveCount(1); // the first entry stays; Undo took only the second
});

test('after the entry is deleted on the board, returning to the page shows Log again (the page remounts here; stillAdded in recipeSummary.test.ts proves the page follows the store while mounted)', async ({ page }) => {
  await seed(page, [stew]);
  await open(page);
  await page.getByRole('button', { name: 'Log', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Added', exact: true })).toBeDisabled();
  await openNutrition(page);
  await deleteEaten(page, 'Long stew');
  await open(page);
  await expect(page.getByRole('button', { name: 'Log', exact: true })).toBeEnabled();
  await expect(strip(page)).toContainText('Not eaten yet');
});

test('Plan… opens the portion sheet on tomorrow, and planning from it lands on the board', async ({ page }) => {
  await seed(page, [stew]);
  await open(page);
  await page.getByRole('button', { name: 'Plan…' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByLabel('Day')).toHaveValue('2026-09-25');
  await expect(dlg.getByText('Which meal?')).toBeVisible();
  await dlg.getByRole('button', { name: 'Dinner', exact: true }).click();
  await dlg.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(dlg.getByText(/Planned Long stew: 1 portion for Dinner on 2026-09-25\./)).toBeVisible();
});

test('Cook for is visible without a tap, changes the amounts shown and saves nothing', async ({ page }) => {
  await seed(page, [{ ...stew, ing: [{ amt: '1 cup', n: 'flour' }] }]);
  await open(page);
  const cook = page.getByRole('group', { name: 'Cook for' });
  await expect(cook).toBeVisible();
  await expect(page.getByRole('button', { name: 'Scale the amounts' })).toHaveCount(0);
  await page.getByRole('button', { name: 'More servings' }).click();
  await expect(cook).toContainText('5 servings');
  await expect(page.locator('.rc-ing').first()).toContainText('1¼');
  await page.reload();
  await open(page);
  await expect(cook).toContainText('4 servings');
  await expect(page.locator('.rc-ing').first()).toContainText('1 cup');
});

test('a recipe with no calories and protein shows "Add them" in place of Log', async ({ page }) => {
  await seed(page, [bare]);
  await open(page, 'No numbers stew');
  await expect(page.getByRole('button', { name: 'Add them' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Plan…' })).toHaveCount(0);
});

test('a ready-made food gets the strip and the action row, and no ingredients, steps or Cook for', async ({ page }) => {
  await seed(page, [food('a', 'Oat cereal', { kcal: 150, p: 5 })]);
  await open(page, 'Oat cereal');
  await expect(strip(page).getByText('150 kcal', { exact: true })).toBeVisible();
  await expect(strip(page).locator('li')).toHaveCount(2); // per serving and last eaten; no at-home box
  await expect(page.getByRole('button', { name: 'Log', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Plan…' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ingredients' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Steps' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Cook for' })).toHaveCount(0);
});

test('on a phone nothing is fixed over the tab bar and the action row is in the page, under the strip', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page, [stew]);
  await open(page);
  expect(await page.locator('.rc-detail *').evaluateAll(els => els.filter(e => getComputedStyle(e).position === 'fixed').length)).toBe(0);
  const s = await box(page, '.rc-strip'), a = await box(page, '.rc-actionrow'), ing = await box(page, '.rc-ingrow');
  expect(a.y).toBeGreaterThanOrEqual(s.y + s.height - 1);
  expect(ing.y).toBeGreaterThan(a.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const last = await box(page, '.rc-steps li:last-child'), tabs = await box(page, '#tab-daily');
  expect(last.y + last.height).toBeLessThanOrEqual(tabs.y + 1);
});

test('the strip boxes stack on a narrow phone and sit side by side on a desktop', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await seed(page, [stew], { 'ironlog:grocery/main': { stores: ['x'], items: [{ id: 'g1', n: 'Flour', store: 'x', qty: 1, every: true, out: false }], groups: [] } });
  await open(page);
  const boxes = async () => strip(page).locator('li').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y) }; }));
  const narrow = await boxes();
  expect(new Set(narrow.map(b => b.x)).size).toBe(1); // one column
  expect(narrow[1].y).toBeGreaterThan(narrow[0].y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });
  const wide = await boxes();
  expect(new Set(wide.map(b => b.y)).size).toBe(1); // one row
});

test('at 1280px the strip sits under the title and nothing on the page is fixed', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seed(page, [stew]);
  await open(page);
  const title = await box(page, '#rc-h'), s = await box(page, '.rc-strip');
  expect(s.y).toBeGreaterThan(title.y);
  expect(await page.locator('.rc-detail *').evaluateAll(els => els.filter(e => getComputedStyle(e).position === 'fixed').length)).toBe(0);
});

test('Edit and Delete are reached through More actions, and Delete still needs a second tap', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page, [stew]);
  await open(page);
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'More actions' }).click();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('button', { name: 'Delete the recipe Long stew' }).click();
  await expect(page.locator('#rc-h')).toBeVisible(); // nothing happened yet
  await expect(page.getByRole('button', { name: 'Tap again to delete' })).toBeVisible();
  await page.getByRole('button', { name: 'Tap again to delete' }).click();
  await expect(page.locator('#rc-h')).toHaveCount(0);
});
