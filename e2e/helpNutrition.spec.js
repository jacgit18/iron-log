import { test, expect } from './fixtures.js';

// Code review R-08: the Daily tab's Supplements section became Nutrition (and Medical, Recipes and Diet went behind the admin flag), but the Help sheet still told every
// account to look under Supplements and described Medical. Help must name what a regular account actually sees.
test('Help names Nutrition and Groceries on Daily, and no longer mentions Supplements or the admin-only Medical', async ({ page }) => {
  await page.click('#help-btn');
  const text = await page.locator('.sheet').innerText();
  expect(text).toMatch(/Daily\.\s*Nutrition/);
  expect(text).toMatch(/On Daily, Nutrition\./);
  expect(text).not.toMatch(/Supplements/);
  expect(text).not.toMatch(/Medical/);
});
