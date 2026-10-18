import { test, expect } from './fixtures.js';

for (const width of [360, 375, 390]) {
  test(`phone ${width}: "Swap day" shows under the swap icon and centered on it`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    const label = page.locator('.swaplabel:visible').first();
    await expect(label).toContainText('Swap day');
    const m = await label.evaluate(el => {
      const icon = el.querySelector('.swapicon').getBoundingClientRect();
      const r = document.createRange(); r.selectNode([...el.childNodes].find(n => n.nodeType === 3));
      const t = r.getBoundingClientRect();
      return { iconMid: icon.left + icon.width / 2, textMid: t.left + t.width / 2, below: t.top >= icon.bottom - 1, fontSize: parseFloat(getComputedStyle(el).fontSize) };
    });
    expect(m.fontSize).toBeGreaterThan(0);
    expect(m.below).toBe(true);
    expect(Math.abs(m.iconMid - m.textMid)).toBeLessThan(1.5);
  });
}

test('phone 360: a tap on the left arrow\'s right edge, under the words, still swaps the day', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await page.locator('.daytabs button').nth(1).click();
  const arrow = page.locator('#swap-2--1');
  await expect(arrow).toBeVisible();
  const box = await arrow.boundingBox();
  await page.mouse.click(box.x + box.width - 3, box.y + box.height - 8); // where the words sit
  await expect(page.locator('.col.swapped').first()).toBeVisible();
});

// A larger browser text size is the same as a narrower phone in em (20em is 320px at the normal size, 400px at 125%), and a test cannot change the
// browser's own text size (an html font-size does not move a media query), so the 320px case stands in for it.
test('phone 320 (what 360 becomes at 112% text): the words go again, so they cannot run over the chevrons', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  const size = await page.locator('.swaplabel').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBe(0);
});
