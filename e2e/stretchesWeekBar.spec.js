import { test, expect } from './fixtures.js';

// The Stretches tab reuses the Board's `.weekbar` class. The Board's grid rules (WeekBar.css) must not reach it: on a phone the week
// arrows and the date share one row and the date is one line, and there is no progress line under the bar.
for (const w of [320, 375, 430]) {
  test(`phone ${w}: the Stretches week bar keeps the arrows and the date on one row`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 812 });
    await page.reload();
    await page.click('#board-stretches');
    const nav = page.locator('.weekbar .weeknav');
    await expect(nav).toBeVisible();
    const m = await page.evaluate(() => {
      const r = s => document.querySelector(s).getBoundingClientRect();
      const h = r('.weekbar .weeknav h2');
      return {
        prev: r('.weekbar [aria-label="Previous week"]'), next: r('.weekbar [aria-label="Next week"]'), h2: h,
        lines: Math.round(h.height / parseFloat(getComputedStyle(document.querySelector('.weekbar .weeknav h2')).lineHeight)),
        navRight: r('.weekbar .weeknav').right,
      };
    });
    expect(Math.abs(m.prev.top - m.next.top), 'arrows share one row').toBeLessThan(12);
    expect(m.lines, 'the date is one line').toBe(1);
    expect(m.navRight, 'the nav stays inside the viewport').toBeLessThanOrEqual(w);
  });
}

// The day tabs already show the day and its count, so the day header under them has no date line and no done count.
test('phone: the Stretches day header has no date line and no count, and a skipped day still says Skipped', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await page.click('#board-stretches');
  const col = page.locator('.col.sel');
  await expect(col.locator('.colhead h3')).toBeVisible();
  await expect(col.locator('.colhead .daydate')).toHaveCount(0);
  await expect(col.locator('.colhead .count')).toHaveCount(0);
  await col.locator('.daymore').click();
  await col.getByRole('button', { name: /Skip day/ }).click();
  await expect(col.locator('.colhead .count')).toHaveText('Skipped');
});

// The Board's week bar grid must not leak to the Stretches bar (it reuses `.weekbar`), and the Board keeps its grid.
test('desktop: the Board week bar is a grid, the Stretches week bar is not', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  const display = (sel) => page.evaluate(s => getComputedStyle(document.querySelector(s)).display, sel);
  expect(await display('.boardroot > .weekbar')).toBe('grid');
  await page.click('#board-stretches');
  await expect(page.locator('.strroot > .weekbar')).toBeVisible();
  expect(await display('.strroot > .weekbar')).not.toBe('grid');
});

// On a phone the week row sits in the joined card (`.wdc .weekbar`): the Board's grid must not reach it on the Board or on Stretches.
test('phone: the week row in the card is not a grid on the Board or on Stretches', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  const display = (sel) => page.evaluate(s => getComputedStyle(document.querySelector(s)).display, sel);
  expect(await display('.boardroot .wdc .weekbar')).not.toBe('grid');
  await page.click('#board-stretches');
  await expect(page.locator('.strroot .wdc .weekbar')).toBeVisible();
  expect(await display('.strroot .wdc .weekbar')).not.toBe('grid');
});
