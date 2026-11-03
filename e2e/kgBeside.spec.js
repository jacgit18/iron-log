import { test, expect } from './fixtures.js';

// The kg equivalent shows beside a pound weight as you type, in the Recent list, and goes away when Settings hides it.
// A unit test cannot show the wiring between the sheet, the store and the Settings switch.
const CARD = 'A-d1s1';

test('kg shows beside the set weight, and in Recent', async ({ page }) => {
  await page.click(`#log-${CARD}-0`);
  await page.waitForSelector('#f-d');
  const w = page.locator('input[aria-label^="Set 1 weight"]');
  await w.fill('135');
  await expect(page.locator('.setw .kg').first()).toHaveText('61.2 kg');
  await w.fill('');
  await expect(page.locator('.setw .kg')).toHaveCount(0);
  await w.fill('135');
  await page.fill('input[aria-label^="Set 1 reps"]', '8');
  await page.click('button:has-text("Save set")');
  await expect(page.locator('#f-d')).toHaveCount(0);
  await page.click(`#log-${CARD}-0`);
  await expect(page.locator('.hist-recent .kg').first()).toHaveText('(61.2 kg)');
});

test('turning Show kg beside lb off removes every kg figure', async ({ page }) => {
  await page.click('#tab-settings');
  const sw = page.getByRole('switch', { name: 'Show kg beside lb' });
  await sw.scrollIntoViewIfNeeded();
  await expect(sw).toBeChecked();
  await sw.uncheck();
  await page.click('#tab-board');
  await page.click(`#log-${CARD}-0`);
  await page.waitForSelector('#f-d');
  await page.fill('input[aria-label^="Set 1 weight"]', '135');
  await expect(page.locator('.kg')).toHaveCount(0);
});

test('at phone width the kg figure leaves the weight box wide enough to type in', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.click(`#log-${CARD}-0`);
  await page.waitForSelector('#f-d');
  const w = page.locator('input[aria-label^="Set 1 weight"]');
  await w.fill('1000.5');
  await expect(page.locator('.setw .kg').first()).toBeVisible();
  const box = await w.boundingBox();
  expect(box.width).toBeGreaterThan(60);
  expect(box.height).toBeGreaterThanOrEqual(40);
});
