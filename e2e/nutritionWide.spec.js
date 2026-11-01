import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// What a unit test cannot catch: Nutrition's Diet and its Supplements, Water and Last 7 days sit in two CSS grid columns from 1280px; only a real layout shows it.
// DOM order stays Diet, Supplements, Water, Last 7 days whatever the width (keyboard and screen-reader order), so the order check holds at every size.
const boxes = page => page.evaluate(() => {
  const r = s => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, right: b.right }; };
  return { diet: r('#diet-h'), sup: r('#sched-h'), vw: innerWidth, a: r('.nutcols > .nutcol:first-child'), b: r('.nutcols > .nutcol:last-child') };
});
const open = async page => { await page.goto('/#/daily/nutrition'); await expect(page.locator('#diet-h')).toBeVisible(); await expect(page.locator('#sched-h')).toBeVisible(); };

for (const w of [1280, 1920, 2560]) {
  test(`at ${w}px Diet and the Supplements, Water and Last 7 days column are side by side, together fill the page container`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 1000 });
    await open(page);
    const { a, b, vw } = await boxes(page);
    expect(b.x).toBeGreaterThan(a.right - 1);
    expect(Math.abs(b.y - a.y)).toBeLessThan(2);
    const wrap = await page.evaluate(() => { const b = document.querySelector('.nutcols').getBoundingClientRect(); return { x: b.x, right: b.right, w: b.width }; });
    expect(Math.abs(a.x - wrap.x)).toBeLessThan(2);
    expect(Math.abs(b.right - wrap.right)).toBeLessThan(2);
    expect(Math.abs(a.w - b.w)).toBeLessThan(2);
    expect(wrap.w).toBeGreaterThan(Math.min(vw, 1920) - 80); // the container, not a 1490px cap
    expect(b.right).toBeLessThanOrEqual(vw);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
}

for (const w of [375, 768, 1024, 1279]) {
  test(`at ${w}px Nutrition is one column, Diet then Supplements`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 1000 });
    await open(page);
    const { diet, sup } = await boxes(page);
    expect(sup.y).toBeGreaterThan(diet.y + 100);
    expect(Math.abs(sup.x - diet.x)).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
}

test('the panels keep their order in the page: Diet, Supplements, Water, Last 7 days', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page);
  const ids = await page.evaluate(() => [...document.querySelectorAll('.nutcols h2')].map(h => h.id));
  expect(ids).toEqual(['diet-h', 'sched-h', 'water-h', 'water7-h']);
});

test('Edit mode keeps the supplement library in the right column, under the schedule', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page);
  await page.click('#sched-edit');
  const inRight = await page.evaluate(() => {
    const right = document.querySelector('.nutcols > .nutcol:last-child');
    const lib = [...right.querySelectorAll('h2')].map(h => h.id);
    return { count: lib.length, first: lib[0] };
  });
  expect(inRight.count).toBeGreaterThan(3); // Supplements, the library, Water, Last 7 days
  expect(inRight.first).toBe('sched-h');
});

for (const [w, h] of [[1920, 1080], [375, 800]]) {
  test(`Nutrition has no accessibility violations at ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await open(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
