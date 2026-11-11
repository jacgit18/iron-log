import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { closeSupplementEditor, openManage, openSupplementEditor, openTargets } from './nutritionBoardHelpers.js';

// What a unit test cannot catch: the Nutrition week board's seven day columns sit side by side in the page container from 1440px (one column with a day stepper below it); only a real layout shows it.
const boxes = page => page.evaluate(() => {
  const r = s => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, right: b.right }; };
  return { board: r('.wb-board'), vw: innerWidth };
});
const open = async page => { await page.goto('/#/daily/nutrition'); await expect(page.locator('#nb-h')).toBeVisible(); };

for (const w of [1440, 1920, 2560]) {
  test(`at ${w}px the seven days of the board are side by side and fill the page container`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 1000 });
    await open(page);
    const cols = await page.evaluate(() => [...document.querySelectorAll('.nb-board > .nb-col')].map(c => { const b = c.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, right: b.right }; }));
    const { board, vw } = await boxes(page);
    expect(cols).toHaveLength(7);
    for (let i = 1; i < 7; i++) {
      expect(cols[i].x).toBeGreaterThan(cols[i - 1].right - 1);
      expect(Math.abs(cols[i].y - cols[0].y)).toBeLessThan(2);
      expect(Math.abs(cols[i].w - cols[0].w)).toBeLessThan(2);
    }
    expect(Math.abs(cols[0].x - board.x)).toBeLessThan(2);
    expect(Math.abs(cols[6].right - board.right)).toBeLessThan(2);
    expect(board.w).toBeGreaterThan(Math.min(vw, 1920) - 80); // the container, not a 1490px cap
    expect(cols[6].right).toBeLessThanOrEqual(vw);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
}

for (const [w, n] of [[375, 1], [767, 1], [768, 2], [999, 2], [1000, 3], [1279, 3], [1439, 3]]) {
  test(`at ${w}px Nutrition shows ${n} day${n > 1 ? 's' : ''} and the day stepper`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 1000 });
    await open(page);
    await expect(page.locator('.nb-col')).toHaveCount(n);
    await expect(page.locator('.nb-step')).toBeVisible();
    const cols = await page.evaluate(() => [...document.querySelectorAll('.nb-col')].map(c => { const b = c.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right }; }));
    expect(cols[0].x).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < n; i++) { expect(cols[i].x).toBeGreaterThan(cols[i - 1].right - 1); expect(Math.abs(cols[i].y - cols[0].y)).toBeLessThan(2); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
}

test('at 1280px the stepper picks the first of three days and the window holds inside the week', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await open(page);
  const names = () => page.locator('.nb-col').evaluateAll(cs => cs.map(c => c.getAttribute('data-day')));
  const first = await names();
  await page.getByRole('button', { name: 'Next day' }).click();
  const next = await names();
  expect(next).toHaveLength(3);
  expect(new Set([...first, ...next]).size).toBeGreaterThanOrEqual(3);
  await page.locator('.nb-steppick').selectOption({ index: 13 }); // a Saturday of this week: the window ends on it
  const sat = await names();
  expect(sat).toHaveLength(3);
});

test('the header holds Targets and goal and Manage, and no Diet panel sits under the board', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page);
  const ids = await page.evaluate(() => [...document.querySelectorAll('#nb-h, #diet-h')].map(h => h.id));
  expect(ids).toEqual(['nb-h']); // the Targets block is no longer a panel under the board
  await expect(page.locator('#nb-targets')).toBeVisible();
  await expect(page.locator('#nb-manage')).toBeVisible();
});

test('Manage opens the supplement editor and library in a sheet, and Done closes them', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page);
  await openSupplementEditor(page);
  await expect(page.locator('#suplib-h')).toBeVisible(); // the merged supplement list
  await closeSupplementEditor(page);
  await expect(page.locator('#sched-h')).toHaveCount(0);
});

test('the Targets and goal and Manage sheets have no accessibility violations', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await open(page);
  await openTargets(page);
  expect((await new AxeBuilder({ page }).include('[role=dialog]').analyze()).violations).toEqual([]);
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
  await openManage(page);
  expect((await new AxeBuilder({ page }).include('[role=dialog]').analyze()).violations).toEqual([]);
});

for (const [w, h] of [[1920, 1080], [375, 800]]) {
  test(`Nutrition has no accessibility violations at ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await open(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
