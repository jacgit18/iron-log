import { test, expect } from './fixtures.js';

// What a unit test cannot catch: Settings' groups lay their two columns (.scol) out with a CSS grid from 1280px; only a real layout shows whether they sit side by side.
const cols = page => page.evaluate(() => {
  const g = [...document.querySelectorAll('.sgrid')].find(x => [...x.querySelectorAll(':scope > .scol')].filter(c => c.children.length).length === 2);
  const [a, b] = [...g.querySelectorAll(':scope > .scol')].filter(c => c.children.length).map(c => c.getBoundingClientRect());
  return { a: { x: a.x, y: a.y, w: a.width, right: a.right }, b: { x: b.x, y: b.y, w: b.width, right: b.right }, vw: innerWidth };
});
test('a settings column with nothing in it takes no room, so a single column starts at the left', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await open(page);
  const x = await page.evaluate(() => {
    const g = [...document.querySelectorAll('.sgrid')].find(e => [...e.children].filter(c => c.children.length).length === 1 && e.children.length === 2);
    if (!g) return null;
    const live = [...g.children].find(c => c.children.length);
    return { live: live.getBoundingClientRect().x, grid: g.getBoundingClientRect().x };
  });
  if (x) expect(Math.abs(x.live - x.grid)).toBeLessThan(2);
});
const open = async page => { await page.goto('/#/settings'); await expect(page.locator('.sjump')).toBeVisible(); };

for (const w of [1280, 1920, 2560]) {
  test(`at ${w}px a settings group's two columns are side by side, each at most 46rem`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 1000 });
    await open(page);
    const { a, b, vw } = await cols(page);
    expect(b.x).toBeGreaterThan(a.right - 1);
    expect(Math.abs(b.y - a.y)).toBeLessThan(2);
    expect(a.w).toBeLessThanOrEqual(736.5);
    expect(b.w).toBeLessThanOrEqual(736.5);
    expect(b.right).toBeLessThanOrEqual(vw);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
}

for (const w of [375, 768, 1024, 1279]) {
  test(`at ${w}px a settings group is one column`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 1000 });
    await open(page);
    const { a, b } = await cols(page);
    expect(b.y).toBeGreaterThanOrEqual(a.y); // the first column can be empty when signed out, so the stack is told by the same left edge below
    expect(Math.abs(b.x - a.x)).toBeLessThan(2);
  });
}
