import { test, expect } from './fixtures.js';

// The muscle box on Progress: the legend and the secondary switch on top, the body on the left and the ranking (or a muscle's exercises) beside it.
// A muscle's exercise list used to push the page wider than the screen (the days never wrapped), and a tap on the body left the list below the figures,
// out of sight; the box keeps both fixed.
const openMuscles = async page => {
  await page.goto('/');
  await page.click('#tab-progress');
  await expect(page.locator('.figs')).toBeVisible();
  await expect(page.locator('.mbar').first()).toBeVisible();
};
const pageIsWide = page => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

test('the legend sits above the body and the ranking beside it on a wide screen', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await openMuscles(page);
  const [legend, figs, bars] = await Promise.all([page.locator('.mapbox .legend'), page.locator('.mapbox .figs'), page.locator('.mapbox .bodyside')].map(l => l.boundingBox()));
  expect(legend.y + legend.height).toBeLessThanOrEqual(figs.y);
  expect(bars.x).toBeGreaterThanOrEqual(figs.x + figs.width - 1);
  expect(Math.abs(bars.y - figs.y)).toBeLessThan(4);
});

test('an open muscle does not make the page scroll sideways on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openMuscles(page);
  await page.locator('.mbar').first().click();
  await expect(page.locator('.mdetail .mrow').first()).toBeVisible();
  expect(await pageIsWide(page)).toBe(false);
});

test('tapping a muscle in the ranking brings its exercises into view on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMuscles(page);
  await page.locator('.mbar').nth(2).click();
  await expect(page.locator('.mdetail h2')).toBeInViewport();
  expect(await pageIsWide(page)).toBe(false);
});

test('the body figures do not zoom the page on a double tap', async ({ page }) => {
  await openMuscles(page);
  await expect(page.locator('.fig svg').first()).toHaveCSS('touch-action', 'manipulation');
});
