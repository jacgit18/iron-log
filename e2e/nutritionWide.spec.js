import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { closeSupplementEditor, openManage, openSupplementEditor } from './nutritionBoardHelpers.js';

// What a unit test cannot catch: the Nutrition week board's seven day columns sit side by side in the page container from 1440px (under 1440px the joined week and day card holds the day tabs); only a real layout shows it.
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
  test(`at ${w}px Nutrition shows ${n} day${n > 1 ? 's' : ''} and ${'the joined week and day card'}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 1000 });
    await open(page);
    await expect(page.locator('.nb-col')).toHaveCount(n);
    await expect(page.locator('.wdc-tabs')).toBeVisible();
    await expect(page.locator('.nb-step, .nb-steppick')).toHaveCount(0); // no dropdown stepper at any width under 1440
    if (w >= 700) {
      await expect(page.locator('.wdc-tabs .shaded')).toHaveCount(n); // the days drawn as columns are shaded
      await expect(page.locator('#nb-manage')).toBeVisible();
      const [week, manage] = await Promise.all([page.locator('.wdc-week').boundingBox(), page.locator('#nb-manage').boundingBox()]);
      expect(Math.abs(manage.x + manage.width - (week.x + week.width))).toBeLessThan(16); // Manage stays at the right end of the week row
    }
    const cols = await page.evaluate(() => [...document.querySelectorAll('.nb-col')].map(c => { const b = c.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right }; }));
    expect(cols[0].x).toBeGreaterThanOrEqual(0);
    const board = await page.locator('.nb-board').evaluate(b => b.getBoundingClientRect().width);
    expect(cols[n - 1].right - cols[0].x).toBeGreaterThan(board - 2); // the days fill the board, a lone day is not squeezed into one of seven tracks
    for (let i = 1; i < n; i++) { expect(cols[i].x).toBeGreaterThan(cols[i - 1].right - 1); expect(Math.abs(cols[i].y - cols[0].y)).toBeLessThan(2); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
}

test('at 1280px tapping a tab inside the window keeps the three days where they are, a tab outside it moves the window and the shading', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await open(page);
  const names = () => page.locator('.nb-col').evaluateAll(cs => cs.map(c => c.getAttribute('data-day')));
  const shaded = () => page.locator('.wdc-tabs .shaded').evaluateAll(bs => bs.map(b => b.id.replace('nbdaytab-', '')));
  const tabs = page.locator('.wdc-tabs [role="tab"]');
  await tabs.nth(0).click();
  const first = await names();
  expect(await shaded()).toEqual(first);
  await tabs.nth(1).click(); // inside the window: it stays
  expect(await names()).toEqual(first);
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await tabs.nth(5).click(); // outside: the window starts at it and is held inside the week
  const moved = await names();
  expect(moved).toHaveLength(3);
  expect(moved).toContain(await tabs.nth(5).evaluate(b => b.id.replace('nbdaytab-', '')));
  expect(await shaded()).toEqual(moved);
});

test('the header holds Manage, and no Diet panel sits under the board', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page);
  const ids = await page.evaluate(() => [...document.querySelectorAll('#nb-h, #diet-h')].map(h => h.id));
  expect(ids).toEqual(['nb-h']); // the Targets block is no longer a panel under the board
  await expect(page.locator('#nb-targets')).toHaveCount(0);
  await expect(page.locator('.wb-legend')).toHaveCount(0);
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

test('the Manage sheet (daily targets, weight and goal, water) has no accessibility violations', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await open(page);
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
