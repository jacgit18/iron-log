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
