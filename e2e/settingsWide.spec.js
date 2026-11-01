import { test, expect } from './fixtures.js';

// What a unit test cannot catch: from 1280px Settings lays its groups in two columns (Training left; Data, App, Erase & delete right); only a real layout shows where they land.
const open = async page => { await page.goto('/#/settings'); await expect(page.locator('.sjump')).toBeVisible(); };
const rects = page => page.evaluate(() => Object.fromEntries(['training', 'data', 'app', 'erase'].map(id => {
  const r = document.getElementById(`set-${id}-h`).closest('.sgroup').getBoundingClientRect();
  return [id, { x: r.x, y: r.y, w: r.width, right: r.right, bottom: r.bottom }];
})));

for (const w of [1280, 1920, 2560]) {
  test(`at ${w}px Data and App sit beside Training, each column at most 46rem`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 1000 });
    await open(page);
    const r = await rects(page);
    expect(r.data.x).toBeGreaterThan(r.training.right - 1);
    expect(Math.abs(r.data.y - r.training.y)).toBeLessThan(2);
    for (const k of ['data', 'app', 'erase']) expect(Math.abs(r[k].x - r.data.x)).toBeLessThan(2); // one right column
    expect(r.app.y).toBeGreaterThanOrEqual(r.data.bottom - 1); // stacked in DOM order
    expect(r.erase.y).toBeGreaterThanOrEqual(r.app.bottom - 1);
    for (const k of Object.keys(r)) expect(r[k].w).toBeLessThanOrEqual(736.5);
    expect(r.app.right).toBeLessThanOrEqual(w);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
}

for (const w of [375, 768, 1024, 1279]) {
  test(`at ${w}px the settings groups are one column in page order`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 1000 });
    await open(page);
    const r = await rects(page);
    const order = ['training', 'data', 'app', 'erase'];
    for (let i = 1; i < order.length; i++) {
      expect(Math.abs(r[order[i]].x - r.training.x)).toBeLessThan(2);
      expect(r[order[i]].y).toBeGreaterThanOrEqual(r[order[i - 1]].bottom - 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
}

for (const [id, label] of [['training', 'Training'], ['data', 'Data'], ['app', 'App'], ['erase', 'Erase & delete']]) {
  test(`at 1920px the rail's ${label} link scrolls to its group, in either column`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 700 });
    await open(page);
    await page.locator('.sjump .chip', { hasText: label }).click();
    await expect(page.locator(`#set-${id}-h`)).toBeFocused();
    // Smooth scrolling is still moving just after the click; the group ends near the top, or as high as the page can scroll when it is short.
    await expect.poll(() => page.evaluate(h => {
      const top = document.getElementById(h).getBoundingClientRect().top;
      const room = document.documentElement.scrollHeight - innerHeight - scrollY;
      return top >= 0 && (top < 100 || room < 2);
    }, `set-${id}-h`)).toBe(true);
  });
}
