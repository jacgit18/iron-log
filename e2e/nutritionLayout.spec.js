import { test, expect } from './fixtures.js';

// What a unit test cannot catch: where things sit on a phone and how the Add sheet lines up (brief nutrition-header-sheet-wording).
const open = async page => { await page.goto('/#/daily/nutrition'); await expect(page.locator('#nb-h')).toBeAttached(); await expect(page.locator('.nb-col').first()).toBeVisible(); };

test('on a 375 x 812 phone the day card starts higher than 500px (it was 538px), the week switcher shares a row with Targets and Manage, and the four add buttons are there', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  const y = await page.locator('.nb-col').first().evaluate(c => c.getBoundingClientRect().y);
  expect(y).toBeLessThan(500);
  const row = await page.evaluate(() => ['.nb-weeksw', '#nb-targets', '#nb-manage'].map(q => Math.round(document.querySelector(q).getBoundingClientRect().y)));
  expect(new Set(row).size).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  for (const n of ['+ Add food', 'Scan barcode', 'Quick add', 'One-off food']) await expect(page.getByRole('button', { name: n })).toBeVisible();
});

test('the Add food sheet shows three labelled groups and every way starts at the same left edge, with its icon', async ({ page }) => {
  await open(page);
  await page.locator('#nb-add').click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { level: 3 })).toHaveText(['Fastest', 'From what you have', 'Whole days and meals']);
  const rows = await sheet.locator('.nb-menu .btn').evaluateAll(bs => bs.map(b => ({ x: Math.round(b.getBoundingClientRect().x), icon: !!b.querySelector('svg'), name: b.querySelector('b').textContent })));
  expect(rows.map(r => r.name)).toEqual(['Quick add', 'Scan barcode', 'One-off food', 'Find food', 'Recipes', 'Saved meals', 'Copy yesterday', 'Save as a meal in Recipes']);
  expect(new Set(rows.map(r => r.x)).size).toBe(1);
  expect(rows.every(r => r.icon)).toBe(true);
  const text = await sheet.locator('.nb-menu .btn').evaluateAll(bs => bs.map(b => getComputedStyle(b).textAlign));
  expect(new Set(text)).toEqual(new Set(['left']));
});

test('a day ahead the Add food sheet leaves out the group that has no way to plan', async ({ page }) => {
  await open(page);
  await page.locator('.nb-dayname').last().click(); // the last day of this week is ahead
  await page.locator('#nb-add').click();
  await expect(page.getByRole('dialog').getByRole('heading', { level: 3 })).toHaveText(['From what you have', 'Whole days and meals']);
});
