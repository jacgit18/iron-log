import { test, expect } from './fixtures.js';

// Layout facts at phone, landscape, tablet and foldable sizes. No pixel comparison: only sizes and positions.
const SIZES = {
  'small phone 320x640': [320, 640],
  'phone 390x844': [390, 844],
  'phone landscape 844x390': [844, 390],
  'short phone landscape 667x375': [667, 375],
  'foldable inner 717x512': [717, 512],
  'foldable inner 673x841': [673, 841],
  'tablet 768x1024': [768, 1024],
  'tablet landscape 1024x768': [1024, 768],
};
const TABS = ['Board', 'Daily', 'Progress', 'Program', 'Settings'];
const box = async (loc) => (await loc.boundingBox());

for (const [name, [w, h]] of Object.entries(SIZES)) {
  test(`${name}: no sideways page scroll on any tab, and tab targets are at least 44px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    for (const t of TABS) {
      const tab = page.getByRole('tab', { name: t, exact: true });
      await tab.click();
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over, `${t} overflows sideways`).toBeLessThanOrEqual(0);
      const b = await box(tab);
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.width).toBeGreaterThanOrEqual(44);
    }
  });

  test(`${name}: the Log sheet fits inside the viewport and scrolls inside itself`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.getByRole('button', { name: /^Log /i }).first().click();
    const sheet = page.locator('.sheet');
    await expect(sheet).toBeVisible();
    const b = await box(sheet);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.y + b.height).toBeLessThanOrEqual(h + 0.5);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(w + 0.5);
  });
}

test('short landscape phone (667x375): the tab bar is a left rail, so a running rest timer leaves room for the board', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await page.getByRole('button', { name: 'Rest timer' }).click();
  const timer = page.locator('.timerbar');
  await expect(timer).toBeVisible();
  const tabs = await box(page.locator('.tabs'));
  expect(tabs.x).toBe(0);
  expect(tabs.width).toBeLessThanOrEqual(100);
  expect(tabs.height).toBeGreaterThanOrEqual(375 - 1);
  const t = await box(timer);
  expect(t.height).toBeLessThanOrEqual(100);
  // Everything above the timer bar is board: at least 250px of the 375px, and the bar does not sit under the rail.
  expect(t.y).toBeGreaterThanOrEqual(250);
  expect(t.x).toBeGreaterThanOrEqual(tabs.width - 1);
  const day = await box(page.locator('.daytabs'));
  expect(day.height).toBeLessThanOrEqual(64);
});

test('phone portrait (390x844) keeps the bottom tab bar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const tabs = await box(page.locator('.tabs'));
  expect(tabs.y + tabs.height).toBeGreaterThanOrEqual(843);
  expect(tabs.width).toBeGreaterThanOrEqual(389);
});

test('landscape at 717x512 and wider keeps the top tab bar', async ({ page }) => {
  await page.setViewportSize({ width: 717, height: 512 });
  const tabs = await box(page.locator('.tabs'));
  expect(tabs.y).toBeLessThan(200);
});
