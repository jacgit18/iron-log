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
  await col.locator('.daypop').getByRole('button', { name: /Skip day/ }).click();
  await expect(col.locator('.colhead .count')).toHaveText('Skipped');
});

// The Board's week bar grid must not leak to the Stretches bar (it reuses `.weekbar`), and the Board keeps its grid.
test('desktop: the Board week row (in its card) is not the old grid, the Stretches week bar is not either', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  const display = (sel) => page.evaluate(s => getComputedStyle(document.querySelector(s)).display, sel);
  expect(await display('.boardroot .wsec > .weekbar')).toBe('flex'); // the Board's week card row (WeekSection.css)
  await page.click('#board-stretches');
  await expect(page.locator('.strroot > .swk')).toBeVisible();
  expect(await display('.strroot > .swk')).not.toBe('grid');
});

// Desktop: the week row and the progress line are one bordered card (arrows and date at the left, progress at the right end); from 701 to
// 1000 px (wide starts above 700) the progress wraps inside the card instead of overflowing. Layout and wiring only.
for (const w of [701, 768, 1000, 1280, 1440, 1920]) {
  test(`desktop ${w}: the Stretches week row and progress are one card, nothing overflows`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await page.reload();
    await page.click('#board-stretches');
    const card = page.locator('.strroot > .swk');
    await expect(card).toBeVisible();
    await expect(card.getByRole('button', { name: 'Previous week' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Next week' })).toBeVisible();
    await expect(card.getByRole('status')).toContainText(/\d+ of \d+ days done/);
    await expect(page.locator('.strroot > .weekbar')).toHaveCount(0);
    const m = await page.evaluate(() => {
      const q = s => document.querySelector(s);
      const c = q('.strroot > .swk').getBoundingClientRect();
      const kids = ['.swk .weeknav', '.swk-prog', '.swk-bar'].map(s => q(s).getBoundingClientRect());
      const h = q('.swk .weeknav h2');
      const cs = getComputedStyle(q('.strroot > .swk'));
      return {
        c, kids, border: cs.borderTopWidth, radius: cs.borderTopLeftRadius,
        lines: Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)),
        scroll: document.documentElement.scrollWidth,
      };
    });
    expect(m.border).toBe('1px');
    expect(m.lines, 'the date is one line').toBe(1);
    for (const r of m.kids) { expect(r.left).toBeGreaterThanOrEqual(m.c.left); expect(r.right).toBeLessThanOrEqual(m.c.right + 0.5); }
    expect(m.scroll, 'no horizontal page scroll').toBeLessThanOrEqual(w);
    if (w >= 1280) { // one row: progress to the right of the arrows, on the same line
      expect(m.kids[1].left).toBeGreaterThan(m.kids[0].right);
      expect(Math.abs((m.kids[1].top + m.kids[1].height / 2) - (m.kids[0].top + m.kids[0].height / 2))).toBeLessThan(8);
    }
  });
}

// Large text: the progress wraps onto its own line inside the card, still at the right end, and the date stays on one line.
test('desktop 768 with large text: the progress wraps under the arrows inside the card', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.reload();
  await page.click('#board-stretches');
  await expect(page.locator('.strroot > .swk')).toBeVisible();
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  const m = await page.evaluate(() => {
    const q = s => document.querySelector(s).getBoundingClientRect();
    const h = document.querySelector('.swk .weeknav h2');
    return { c: q('.strroot > .swk'), nav: q('.swk .weeknav'), prog: q('.swk-prog'), lines: Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)), scroll: document.documentElement.scrollWidth };
  });
  expect(m.prog.top, 'the progress is on a second line').toBeGreaterThanOrEqual(m.nav.bottom - 1);
  expect(m.prog.right, 'inside the card').toBeLessThanOrEqual(m.c.right + 0.5);
  expect(m.lines, 'the date is one line').toBe(1);
  expect(m.scroll, 'no horizontal page scroll').toBeLessThanOrEqual(768);
});

// The phone keeps the joined card and has no desktop card or progress line.
test('phone: no desktop week card on Stretches', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await page.click('#board-stretches');
  await expect(page.locator('.strroot .wdc')).toBeVisible();
  await expect(page.locator('.strroot .swk')).toHaveCount(0);
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
