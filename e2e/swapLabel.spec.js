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
