import { test, expect } from './fixtures.js';

// What a unit test cannot catch: the Board's seven day columns are a CSS grid, so whether they fit depends on the real container width, the gap and the
// scrollbar, which only a browser lays out. At a 1920px desktop all seven columns sit inside the viewport; at 1280px the Board still scrolls sideways.
const columns = page => page.locator('.board .col');

test('at 1920px all seven day columns are inside the viewport and the Board does not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(columns(page)).toHaveCount(7);
  const boxes = await columns(page).evaluateAll(cols => cols.map(c => { const r = c.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width }; }));
  for (const b of boxes) {
    expect(b.left).toBeGreaterThanOrEqual(0);
    expect(b.right).toBeLessThanOrEqual(1920);
    expect(b.width).toBeGreaterThanOrEqual(250);
  }
  const { client, scroll } = await page.locator('.board').evaluate(b => ({ client: b.clientWidth, scroll: b.scrollWidth }));
  expect(scroll).toBeLessThanOrEqual(client);
});

test('at 1280px the day columns keep their 270px minimum and the Board scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { client, scroll, first } = await page.locator('.board').evaluate(b => ({ client: b.clientWidth, scroll: b.scrollWidth, first: b.querySelector('.col').getBoundingClientRect().width }));
  expect(scroll).toBeGreaterThan(client);
  expect(first).toBeCloseTo(270, 0);
});

// The 1870px breakpoint is 7 x 250 + 6 x 12 + 32px of page padding + a 15px scrollbar. One pixel either side pins it, so a change to the padding, the gap
// or the minimum has to move the breakpoint too.
test('the columns switch to the 250px minimum exactly at 1870px', async ({ page }) => {
  const first = () => page.locator('.board').evaluate(b => ({ w: b.querySelector('.col').getBoundingClientRect().width, fits: b.scrollWidth <= b.clientWidth }));
  await page.setViewportSize({ width: 1869, height: 1080 });
  expect(await first()).toMatchObject({ w: 270, fits: false });
  await page.setViewportSize({ width: 1870, height: 1080 });
  const at = await first();
  expect(at.fits).toBe(true);
  expect(at.w).toBeLessThan(270);
});
