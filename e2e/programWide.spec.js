import { test, expect } from './fixtures.js';

// What a unit test cannot catch: the editor panel and the program library are two sections that a CSS grid puts side by side from 1280px, so it needs a real layout.
// DOM order stays editor, note, library whatever the width (keyboard and screen-reader order), so the order check holds at every size.
const boxes = page => page.evaluate(() => {
  const r = s => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, right: b.right }; };
  return { ed: r('.edcols > .edprog:not(.lib)'), lib: r('.edcols > .lib'), vw: innerWidth };
});
const open = async page => { await page.goto('/#/program'); await expect(page.locator('.edcols > .lib')).toBeVisible(); };

for (const w of [1280, 1920, 2560]) {
  test(`at ${w}px the program editor and the program library are side by side, each at most 760px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 1000 });
    await open(page);
    const { ed, lib, vw } = await boxes(page);
    expect(lib.x).toBeGreaterThan(ed.right - 1);
    expect(Math.abs(lib.y - ed.y)).toBeLessThan(2);
    expect(ed.w).toBeLessThanOrEqual(760.5);
    expect(lib.w).toBeLessThanOrEqual(760.5);
    expect(lib.right).toBeLessThanOrEqual(vw);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
}

for (const w of [375, 768, 1024, 1279]) {
  test(`at ${w}px the library stays under the editor in one column`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 1000 });
    await open(page);
    const { ed, lib } = await boxes(page);
    expect(lib.y).toBeGreaterThan(ed.y + 100);
    expect(Math.abs(lib.x - ed.x)).toBeLessThan(2);
  });
}

test('the Day buttons, the editor and the library keep their document order at 1920px', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page);
  const order = await page.evaluate(() => {
    const els = [document.querySelector('.daybtns'), document.querySelector('.edcols > .edprog:not(.lib)'), document.querySelector('.edcols > .note'), document.querySelector('.edcols > .lib')];
    return els.every((e, i) => i === 0 || !!(els[i - 1].compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(order).toBe(true);
});

test('Back from the Exercise library on the Program tab still returns and the address is kept at 1920px', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page);
  await page.getByRole('button', { name: 'Exercise library' }).click();
  await expect(page).toHaveURL(/#\/program\/exercises$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Exercise library' })).toBeVisible();
});
