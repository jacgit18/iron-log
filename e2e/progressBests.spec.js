import { test, expect } from './fixtures.js';

// Training trends > Personal bests: the full-width panel puts its rows in two columns of 5 (10 at most) on a wide screen, and shows the latest 5 in one column on a phone.
// Eleven lifts each beat their earlier best inside the 8-week window, on different days so the order is fixed.
const IDS = ['hack', 'latpd', 'chestpress', 'zottman', 'kbleg', 'grip', 'canoe', 'suitcase', 'zercher', 'platerot', 'wristpd'];
const seed = (page, ids) => page.addInitScript(ids => {
  if (localStorage.getItem('ironlog:seeded')) return;
  localStorage.setItem('ironlog:seeded', '1');
  ids.forEach((id, i) => {
    const d = `2026-09-${String(10 + i).padStart(2, '0')}`;
    localStorage.setItem(`ironlog:logs/${id}`, JSON.stringify({ entries: [{ id: `${id}1`, d: '2026-09-01', w: 100, s: 3, r: 8, ph: 'hyp' }, { id: `${id}2`, d, w: 110, s: 3, r: 8, ph: 'hyp' }] }));
  });
}, ids);
const rows = page => page.locator('.bests .bestrow');

test('two columns of 5 on a wide screen, filled column by column, at most 10', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await seed(page, IDS);
  await page.goto('/#/progress/trends');
  await page.reload();
  await expect(rows(page)).toHaveCount(10);
  const xs = await rows(page).evaluateAll(es => es.map(e => Math.round(e.getBoundingClientRect().left)));
  expect(new Set(xs).size).toBe(2);
  expect(xs.slice(0, 5).every(x => x === xs[0])).toBe(true); // the first five stand in one column
  expect(xs[5]).toBeGreaterThan(xs[0]);
  const panel = await page.locator('.tchart', { has: page.getByRole('heading', { name: 'Personal bests' }) }).boundingBox();
  const change = await page.locator('.tchart', { has: page.getByRole('heading', { name: 'Weight change by exercise' }) }).boundingBox();
  expect(Math.abs(panel.width - change.width)).toBeLessThan(2); // as wide as the page, no empty half beside it
});

test('one column of the latest 5 on a phone, with no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page, IDS);
  await page.goto('/#/progress/trends');
  await page.reload();
  await expect(rows(page).first()).toBeVisible();
  expect(await rows(page).evaluateAll(es => es.filter(e => e.offsetParent !== null).length)).toBe(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('with three bests there is one column and no gap', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await seed(page, IDS.slice(0, 3));
  await page.goto('/#/progress/trends');
  await page.reload();
  await expect(rows(page)).toHaveCount(3);
  const xs = await rows(page).evaluateAll(es => es.map(e => Math.round(e.getBoundingClientRect().left)));
  expect(new Set(xs).size).toBe(1);
});
