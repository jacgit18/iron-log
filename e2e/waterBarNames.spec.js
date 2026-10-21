import { test, expect } from './fixtures.js';

// Lighthouse "label-content-name-mismatch": a water bar's accessible name must contain the text it shows ("Thu 24 64"), so voice control can say what it sees.
test('each water bar is named with the text it shows', async ({ page }) => {
  await page.goto('/?open=daily');
  const bars = page.locator('.mbars[aria-label="Last 7 days of water"] .mbar');
  await expect(bars.first()).toBeVisible();
  const n = await bars.count();
  expect(n).toBe(7);
  for (let i = 0; i < n; i++) {
    const bar = bars.nth(i);
    const shown = ((await bar.innerText()).replace(/\s+/g, ' ').trim());
    const name = ((await bar.getAttribute('aria-label')) || '').replace(/\s+/g, ' ');
    expect(name, `bar ${i} shows "${shown}"`).toContain(shown);
  }
});
