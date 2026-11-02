import { test, expect } from './fixtures.js';

// The browser's Back (a phone's swipe or button) walks the tabs and closes a sheet instead of leaving the app. The decisions are tested in
// src/lib/backNav.test.ts; this covers the wiring with real history, which a node test cannot: tabs, a sheet, a Settings screen.
const selected = page => page.locator('.tablist [role=tab][aria-selected=true]');

test('Back goes to the previous tab, closes a sheet, and leaves no dead press after a Settings screen', async ({ page }) => {
  await page.locator('#tab-daily').click();
  await page.locator('#tab-progress').click();
  await page.goBack();
  await expect(selected(page)).toHaveText('Daily');
  await page.goBack();
  await expect(selected(page)).toHaveText('Board');

  await page.locator('#help-btn').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(selected(page)).toHaveText('Board'); // closing the sheet did not also leave the tab

  await page.locator('#help-btn').click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goBack(); // Escape took the sheet's entry back, so this leaves the app instead of a dead press on a sheet entry
  await expect(page.locator('.tablist')).toHaveCount(0);

  await page.goto('/');
  await page.locator('#tab-settings, #account-badge').first().click();
  await page.locator('#drill-maxes').click();
  await page.locator('#tab-board').click();
  await page.goBack();
  await expect(selected(page)).toHaveText('Settings');
  await expect(page.locator('.smain')).toBeVisible(); // the Settings list, not a stale screen
});
