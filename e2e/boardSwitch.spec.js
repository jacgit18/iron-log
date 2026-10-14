import { test, expect } from './fixtures.js';

// The program mode menu sits on the Workout / Stretches row, so a phone shows one row where it showed two.
test('on a phone the mode menu shares a row with Workout / Stretches', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  const sw = await page.locator('#board-workout').boundingBox();
  const mode = await page.locator('#board-mode').boundingBox();
  expect(Math.abs(sw.y - mode.y)).toBeLessThan(30);
  expect(mode.x + mode.width).toBeLessThanOrEqual(375);
});

test('the mode menu is on the Workout view only, and Mode 2 adds the A / B switch under the week', async ({ page }) => {
  const mode = page.locator('#board-mode');
  await expect(mode).toBeVisible();
  await mode.selectOption('2');
  await expect(page.getByRole('group', { name: 'Program this week' })).toBeVisible();
  await page.click('#board-stretches');
  await expect(mode).toHaveCount(0);
  await page.click('#board-workout');
  await expect(mode).toHaveValue('2');
});
