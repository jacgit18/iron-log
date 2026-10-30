import { test, expect } from './fixtures.js';

// Muscles on a phone: a muscle's exercise list used to push the page wider than the screen (the days never wrapped), so the
// page panned sideways. A tap on the body also left the list below the figures, out of sight. The ranking and a muscle's exercises now sit on the
// Muscle details page (a tile on Progress); the body map stays on the Progress page itself, where a tap filters the lists.
const openMuscles = async page => {
  await page.goto('/');
  await page.click('#tab-progress');
  await expect(page.locator('.figs')).toBeVisible();
};
const openDetails = async page => {
  await openMuscles(page);
  await page.getByRole('button', { name: /Muscle details/ }).click();
  await expect(page.locator('.mbar').first()).toBeVisible();
};
const pageIsWide = page => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

test('an open muscle does not make the page scroll sideways on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openDetails(page);
  await page.locator('.mbar').first().click();
  await expect(page.locator('.mdetail .mrow').first()).toBeVisible();
  expect(await pageIsWide(page)).toBe(false);
});

test('tapping a muscle in the ranking brings its exercises into view on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openDetails(page);
  await page.locator('.mbar').nth(2).click();
  await expect(page.locator('.mdetail h2')).toBeInViewport();
  expect(await pageIsWide(page)).toBe(false);
});

test('the body figures do not zoom the page on a double tap', async ({ page }) => {
  await openMuscles(page);
  await expect(page.locator('.fig svg').first()).toHaveCSS('touch-action', 'manipulation');
});
