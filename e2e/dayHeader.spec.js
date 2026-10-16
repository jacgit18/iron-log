import { test, expect } from './fixtures.js';

// A day's header, left to right: tick box, title, swap arrows (centered), Rest box at the far right. The same on a phone and a wide
// screen, with no ⋯ button and no done count (the day tabs show it).
const phone = async page => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await expect(page.locator('.col.sel article.card').first()).toBeVisible();
};

const places = col => col.evaluate(c => {
  const box = sel => c.querySelector(`.colhead ${sel}`).getBoundingClientRect();
  return { day: box('.chk').left, arrows: box('.swaps').left, rest: box('.restchk').left, restRight: box('.restchk').right, head: c.querySelector('.colhead').getBoundingClientRect().right };
});

test('on a phone the header shows the arrows and the Rest box, with no ⋯ or count', async ({ page }) => {
  await phone(page);
  const col = page.locator('.col.sel');
  await expect(col.locator('.swapbtn').first()).toBeVisible();
  await expect(col.locator('.restchk')).toBeVisible();
  await expect(col.getByRole('button', { name: /^More for Day/ })).toHaveCount(0);
  await expect(col.locator('.colhead .count')).toHaveCount(0);
  const o = await places(col);
  expect(o.day).toBeLessThan(o.arrows);
  expect(o.arrows).toBeLessThan(o.rest);
  expect(o.head - o.restRight).toBeLessThan(12); // the Rest box is at the end of the row
});

test('the Rest box makes a rest day from the header, and a rest day keeps it ticked', async ({ page }) => {
  await phone(page);
  await page.locator('#rest-1').check();
  await page.locator('#daytab-1').click(); // a phone shows one day at a time: go to the rest day
  const rest = page.locator('#col-1');
  await expect(rest).toHaveClass(/rest/);
  await expect(rest.locator('.restchk input')).toBeChecked();
  await expect(rest.locator('.swapbtn').first()).toBeVisible();
  await rest.locator('.restchk input').uncheck();
  await expect(page.locator('.col.rest')).toHaveCount(0);
});

test('on a wide screen the header has the same order, and Day 1 keeps its one arrow in the right-hand slot', async ({ page }) => {
  const col = page.locator('#col-1');
  await expect(col.locator('.restchk')).toBeVisible();
  await expect(col.locator('#swap-1--1')).toHaveCount(0);
  await expect(col.locator('#swap-1-1')).toBeVisible();
  const o = await places(col);
  expect(o.arrows).toBeLessThan(o.rest);
  const inRightSlot = await col.evaluate(c => c.querySelector('#swap-1-1').getBoundingClientRect().left > c.querySelector('.swaps').getBoundingClientRect().left + 10);
  expect(inRightSlot).toBe(true);
});
