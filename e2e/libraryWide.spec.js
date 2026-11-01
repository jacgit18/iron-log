import { test, expect } from './fixtures.js';

// What a unit test cannot catch: the Exercise library is a CSS grid of two columns from 1280px (and one column below), so it needs a real layout.
// The Stretch library shares the .exlib class and must stay as it is; DOM order stays the same at every width.
const open = async (page, name = 'Exercise library') => { await page.goto('/#/program'); await page.getByRole('button', { name, exact: true }).click(); await expect(page.locator('.exlib .exrow').first()).toBeVisible(); };
const cols = page => page.evaluate(() => {
  const rows = [...document.querySelectorAll('.exlib .exrow')].map(r => r.getBoundingClientRect());
  const panel = document.querySelector('.exlib').getBoundingClientRect();
  const bar = document.querySelector('.exlib .libbar').getBoundingClientRect();
  const kids = ['.libsearch', '.libchips'].map(s => document.querySelector(`.exlib .libbar ${s}`).getBoundingClientRect());
  return { xs: [...new Set(rows.map(r => Math.round(r.x)))], first: rows[0], last: rows[rows.length - 1], n: rows.length, panel: { x: panel.x, w: panel.width, right: panel.right }, bar: { w: bar.width }, kids: kids.map(k => ({ y: Math.round(k.y), h: k.height })), vw: innerWidth, h: document.documentElement.scrollHeight };
});

for (const w of [1280, 1920, 2560]) {
  test(`at ${w}px the exercise rows sit in two columns, the panel spans the page and the search row is one line`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 1000 });
    await open(page);
    const c = await cols(page);
    expect(c.n).toBeGreaterThan(10);
    expect(c.xs).toHaveLength(2);
    expect(c.panel.w).toBeGreaterThan(Math.min(w, 1920) - 80); // no 760px cap
    expect(c.panel.right).toBeLessThanOrEqual(c.vw);
    expect(c.first.width).toBeGreaterThan(300);
    expect(Math.abs(c.kids[0].y - c.kids[1].y)).toBeLessThan(c.kids[0].h); // search and chips share a row
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    const last = await page.locator('.exlib > .exrows > .exrow').last().getByRole('button', { name: /^Edit / }).boundingBox();
    expect(last.height).toBeGreaterThanOrEqual(44 - 1);
  });
}

for (const w of [375, 768, 1024, 1279]) {
  test(`at ${w}px the exercise library stays one column, at most 760px wide`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 1000 });
    await open(page);
    const c = await cols(page);
    expect(c.xs).toHaveLength(1);
    expect(c.panel.w).toBeLessThanOrEqual(760.5);
    expect(c.kids[1].y).toBeGreaterThan(c.kids[0].y); // chips under the search box
  });
}

test('at 1920px the page is about half as tall in two columns as in one', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page);
  const two = (await cols(page)).h;
  await page.evaluate(() => document.querySelector('.exlibwide').classList.remove('exlibwide'));
  const one = (await cols(page)).h;
  expect(two).toBeLessThan(one * 0.65);
});

test('Stretch library: two columns from 1280px with the group headings full width, one column at 1279px', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page, 'Stretch library');
  const c = await cols(page);
  expect(c.xs).toHaveLength(2);
  expect(c.panel.w).toBeGreaterThan(1800);
  const head = await page.locator('.exlib .libgroup').first().boundingBox();
  expect(head.width).toBeGreaterThan(1500);
  await page.getByRole('button', { name: 'Edit order' }).click();
  expect((await cols(page)).xs).toHaveLength(1); // arrows move a row up or down, so Edit order stays one column
  await page.setViewportSize({ width: 1279, height: 1000 });
  expect((await cols(page)).xs).toHaveLength(1);
});

test('the Supplement library is not affected: it has no exlibwide class', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/#/daily/supplements');
  await expect(page.locator('.exlibwide')).toHaveCount(0);
});

test('at 1920px the rows keep their order, an empty result shows its message, and Edit opens the sheet', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page);
  const names = await page.locator('.exlib > .exrows .exrow .exmain b').allTextContents();
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  expect(names.slice(0, 3)).toEqual(sorted.slice(0, 3)); // DOM order is the sort order, read row by row
  await page.getByRole('searchbox').fill('zzzz-no-match');
  await expect(page.locator('.exlib > .exrows > .note')).toBeVisible();
  await page.getByRole('searchbox').fill('');
  await page.locator('.exlib .exrow').first().getByRole('button', { name: /^Edit / }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
