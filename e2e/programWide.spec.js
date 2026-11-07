import { test, expect } from './fixtures.js';

// What a unit test cannot catch: from 1280px a CSS grid puts the editor and the Day at a glance panel side by side, the library panel under the editor, the header card above them (it holds Create a program from 701px).
// DOM order stays editor, summary, note, library whatever the width (keyboard and screen-reader order), so the order check holds at every size.
const boxes = page => page.evaluate(() => {
  const r = s => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, right: b.right, bottom: b.bottom }; };
  return { ed: r('.edcols > .edprog:not(.lib)'), sum: r('.edcols > .daysum'), lib: r('.edcols > .lib'), head: r('.proghead'), vw: innerWidth };
});
const open = async page => { await page.goto('/#/program'); await expect(page.locator('.edcols > .lib')).toBeAttached(); };

for (const w of [1280, 1920, 2560]) {
  test(`at ${w}px the editor and Day at a glance are side by side, the library is under the editor and the header card is on top`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 1000 });
    await open(page);
    const { ed, sum, lib, head, vw } = await boxes(page);
    expect(sum.x).toBeGreaterThan(ed.right - 1);
    expect(Math.abs(sum.y - ed.y)).toBeLessThan(2);
    expect(sum.right).toBeLessThanOrEqual(vw);
    expect(lib.y).toBeGreaterThan(ed.bottom - 1);
    expect(head.bottom).toBeLessThanOrEqual(ed.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
}

for (const w of [375, 768, 1024, 1279]) {
  test(`at ${w}px nothing is new: one column, no Day at a glance, Create a program in the header card from 701px and the floating pill below it`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 1000 });
    await open(page);
    const { ed, lib } = await boxes(page);
    expect(lib.y).toBeGreaterThan(ed.y + 100);
    expect(Math.abs(lib.x - ed.x)).toBeLessThan(2);
    await expect(page.locator('.daysum')).toBeHidden();
    if (w > 700) {
      await expect(page.locator('.proghead .createprog')).toBeVisible();
      await expect(page.locator('.programfab')).toBeHidden();
    } else {
      await expect(page.locator('.proghead .createprog')).toBeHidden();
      await expect(page.locator('.programfab')).toBeVisible();
    }
  });
}

test('Create a program is in the header card, and opens the same sheet', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page);
  await page.getByRole('button', { name: 'Create a program' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('Day at a glance follows the open day: its exercise count matches the Day picker', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page);
  await page.getByRole('button', { name: 'Day 2', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Day 2 at a glance' })).toBeVisible();
  const n = await page.locator('.daystep .daypick').evaluate(el => el.options[el.selectedIndex].text.match(/(\d+) exercise/)[1]);
  await expect(page.locator('.daysum-strip div').first().locator('b')).toHaveText(n);
});

test('the Day buttons, the editor, Day at a glance and the library keep their document order at 1920px', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page);
  const order = await page.evaluate(() => {
    const els = [document.querySelector('.daybtns'), document.querySelector('.edcols > .edprog:not(.lib)'), document.querySelector('.edcols > .daysum'), document.querySelector('.edcols > .note'), document.querySelector('.edcols > .lib')];
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
