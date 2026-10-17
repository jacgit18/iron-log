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

// A long title (a day with a name set in the program editor) or a stamped date must not push the Rest box onto a second level:
// the day's box and the Rest box stay on one level at every width, and on a phone the arrows stay with them.
for (const [name, w, h] of [['phone 360', 360, 780], ['phone 390', 390, 844], ['wide 1024', 1024, 768], ['wide 1440', 1440, 900]]) {
  test(`${name}: a long title and a stamped date keep the day's box and the Rest box on one level`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.reload();
    const col = page.locator(w <= 700 ? '.col.sel' : '.col').first();
    await expect(col.locator('article.card').first()).toBeVisible();
    const tops = () => col.evaluate(c => { const hd = c.querySelector('.colhead'); const t = s => hd.querySelector(s).getBoundingClientRect().top; return { day: t('.chk'), rest: t('.restchk'), arrows: t('.swaps'), head: hd.getBoundingClientRect().height }; });
    await col.locator('.colhead h3').evaluate(h3 => { h3.textContent = 'Lower body + reactive power'; });
    const long = await tops();
    expect(Math.abs(long.rest - long.day), 'Rest is level with the day box (long title)').toBeLessThan(12);
    if (w <= 700) expect(Math.abs(long.arrows - long.day), 'the arrows are on the same level on a phone (long title)').toBeLessThan(12);
    await col.locator('.colhead h3').evaluate(h3 => { h3.textContent = 'Wednesday'; });
    await col.locator('article.card input.cardchk').first().check(); // the first logged set stamps the day's date
    await expect(col.locator('.dd-text')).toBeVisible();
    const stamped = await tops();
    expect(Math.abs(stamped.rest - stamped.day), 'Rest is level with the day box (stamped date)').toBeLessThan(12);
    if (w <= 700) expect(Math.abs(stamped.arrows - stamped.day), 'the arrows are on the same level on a phone (stamped date)').toBeLessThan(12);
  });
}

test('on a phone the header shows the arrows and the Rest box, with no ⋯ or count', async ({ page }) => {
  await phone(page);
  const col = page.locator('.col.sel');
  await expect(col.locator('.swapbtn').first()).toBeVisible();
  await expect(col.locator('.restchk')).toBeVisible();
  await expect(col.getByRole('button', { name: /^More for Day/ })).toHaveCount(0);
  await expect(col.locator('.colhead .daycount')).toHaveCount(0); // the day tabs show it on a phone
  const o = await places(col);
  expect(o.day).toBeLessThan(o.arrows);
  expect(o.arrows).toBeLessThan(o.rest);
  expect(o.head - o.restRight).toBeLessThan(12); // the Rest box is at the end of the row
});

test('stamping a date on a day moves neither the Rest box nor the arrows, and lifts the title above the date', async ({ page }) => {
  await phone(page);
  const col = page.locator('.col.sel');
  const head = () => col.locator('.colhead').evaluate(h => {
    const o = h.getBoundingClientRect(); // measured from the header, so a scroll does not count
    const at = sel => { const r = h.querySelector(sel).getBoundingClientRect(); return [r.left - o.left, r.top - o.top, r.width, r.height]; };
    return { arrows: at('.swaps'), rest: at('.restchk'), head: at('h3') };
  });
  await expect(col.locator('.dd-text')).toHaveCount(0);
  const before = await head();
  await col.locator('article.card input.cardchk').first().check(); // the first logged set stamps the day's date
  await expect(col.locator('.dd-text')).toBeVisible();
  const after = await head();
  expect(after.arrows).toEqual(before.arrows);
  expect(after.rest).toEqual(before.rest);
  // The title was level with the tick box while the date room was empty (2rem, so half of it is 1rem = 16px); stamping lifts it to the top, same left, width and height.
  expect([after.head[0], after.head[2], after.head[3]]).toEqual([before.head[0], before.head[2], before.head[3]]);
  expect(before.head[1] - after.head[1]).toBeCloseTo(16, 0);
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

test('on a wide screen the Rest box stays at the right end, and Day 1 keeps its one arrow in the right-hand slot', async ({ page }) => {
  const col = page.locator('#col-1');
  await expect(col.locator('.restchk')).toBeVisible();
  await expect(col.locator('#swap-1--1')).toHaveCount(0);
  await expect(col.locator('#swap-1-1')).toBeVisible();
  const o = await places(col);
  expect(o.head - o.restRight).toBeLessThan(12); // at the right end of the first row
  const inRightSlot = await col.evaluate(c => c.querySelector('#swap-1-1').getBoundingClientRect().left > c.querySelector('.swaps').getBoundingClientRect().left + 10);
  expect(inRightSlot).toBe(true);
});

test('on a wide screen there is no done / total count in the header either, and the two boxes are level', async ({ page }) => {
  await expect(page.locator('#col-1 .colhead .daycount')).toHaveCount(0);
  const level = await page.locator('#col-1').evaluate(c => {
    const mid = sel => { const r = c.querySelector(`.colhead ${sel}`).getBoundingClientRect(); return r.top + r.height / 2; };
    const swaps = c.querySelector('.colhead .swaps').getBoundingClientRect();
    const box = c.querySelector('.colhead .chk').getBoundingClientRect();
    return { dayBox: mid('.chk'), restBox: mid('.restchk .chk'), title: mid('h3'), swapsBelow: swaps.top >= box.bottom - 1 };
  });
  expect(Math.abs(level.dayBox - level.restBox)).toBeLessThan(2);
  expect(Math.abs(level.title - level.dayBox)).toBeLessThan(2); // no date stamped yet: the title is level with the boxes too
  expect(level.swapsBelow).toBe(true); // the arrows have their own row under them
});
