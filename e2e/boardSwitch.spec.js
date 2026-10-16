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

test('the mode menu is on the Workout view only, and Mode 2 adds the A / B switch to the header', async ({ page }) => {
  const mode = page.locator('#board-mode');
  await expect(mode).toBeVisible();
  await expect(page.locator('header.top .pill')).toHaveCount(0); // the program and mode pills are gone from the header
  await expect(page.getByRole('group', { name: 'Program this week' })).toHaveCount(0);
  await mode.selectOption('2');
  const sw = page.locator('header.top').getByRole('group', { name: 'Program this week' });
  await expect(sw).toBeVisible();
  await expect(page.locator('.weeknav').getByRole('group', { name: 'Program this week' })).toHaveCount(0); // no longer beside the week
  await expect(page.locator('#progswitch-note')).toHaveText('Set by month');
  await sw.locator('button[aria-pressed="false"]').click(); // the other program than the month's
  await expect(page.locator('#progswitch-note')).toContainText('Switched');
  await page.click('#tab-daily');
  await expect(page.getByRole('group', { name: 'Program this week' })).toHaveCount(0); // it acts on the Board's week, so it is only there
  await page.click('#tab-board');
  await page.click('#board-stretches');
  await expect(mode).toHaveCount(0);
  await page.click('#board-workout');
  await expect(mode).toHaveValue('2');
});
