import { test, expect } from './fixtures.js';

// Program tab: To Experiments takes a card out of the day and lists it under Experiments on the board; Undo reverses both.
test('move a card to Experiments from the Program tab, then see it on the board', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.click('#tab-program');
  const rows = page.locator('.edrow');
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  await rows.first().getByRole('button', { name: /to Experiments$/ }).click();
  await expect(rows).toHaveCount(count - 1);
  await expect(page.locator('.removednote')).toContainText('to Experiments');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);

  await page.click('#tab-board');
  await expect(page.locator('.explist .expcard')).toHaveCount(1);
});

test('Undo puts the card back and takes it out of Experiments', async ({ page }) => {
  await page.goto('/');
  await page.click('#tab-program');
  const rows = page.locator('.edrow');
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  await rows.first().getByRole('button', { name: /to Experiments$/ }).click();
  await expect(rows).toHaveCount(count - 1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(rows).toHaveCount(count);
  await page.click('#tab-board');
  await expect(page.locator('.explist .expcard')).toHaveCount(0);
});
