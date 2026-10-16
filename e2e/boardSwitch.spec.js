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
  await expect(page.locator('#progswitch-note')).toHaveText('Set by month'); // said to a screen reader with the switch
  expect((await page.locator('#progswitch-note').boundingBox()).width).toBeLessThanOrEqual(1); // and not drawn beside it
  await expect(sw.locator('button').first()).toHaveText('A'); // a small slider that says A or B
  await expect(sw.locator('button').nth(1)).toHaveText('B');
  const pill = await sw.boundingBox();
  expect(pill.height).toBeLessThanOrEqual(34);
  expect((await sw.locator('button').first().boundingBox()).height).toBeGreaterThanOrEqual(44); // the touch target stays 44px
  await sw.locator('button[aria-pressed="false"]').click(); // the other program than the month's
  await expect(sw).toHaveAttribute('data-pos', /^[ab]$/);
  await expect(page.locator('#progswitch-note')).toContainText('Switched');
  await page.click('#tab-daily');
  await expect(page.getByRole('group', { name: 'Program this week' })).toHaveCount(0); // it acts on the Board's week, so it is only there
  await page.click('#tab-board');
  await page.click('#board-stretches');
  await expect(mode).toHaveCount(0);
  await page.click('#board-workout');
  await expect(mode).toHaveValue('2');
});

test('a renamed program keeps its letter in the slider button name, and its full name on hover', async ({ page }) => {
  await page.locator('#board-mode').selectOption('2'); // saved to this browser
  await page.evaluate(() => {
    const cfg = JSON.parse(localStorage.getItem('ironlog:config/main') || '{}');
    cfg.progNames = { A: 'Upper', B: 'Lower' };
    localStorage.setItem('ironlog:config/main', JSON.stringify(cfg));
  });
  await page.reload();
  const sw = page.locator('header.top').getByRole('group', { name: 'Program this week' });
  await expect(sw.locator('button').first()).toHaveAttribute('aria-label', 'A: Upper');
  await expect(sw.locator('button').nth(1)).toHaveAttribute('aria-label', 'B: Lower');
  await expect(sw.locator('button').first()).toHaveAttribute('title', 'Upper');
  await expect(sw.locator('button').first()).toHaveText('A'); // what is drawn is the letter; the name above starts with it
});
