import { test, expect } from './fixtures.js';

// Settings is three groups (Training, Data, App) with a jump row. The row moves focus to a group's heading, then scrolls to it.
// GitHub backup is gone (ADR 035): the data file is the one backup path.
const openSettings = async page => { await page.click('#tab-settings'); await expect(page.getByRole('heading', { name: 'Export & import' })).toBeAttached(); };

test('Settings has the three groups, one export and import panel, and no GitHub backup', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  for (const name of ['Training', 'Data', 'App']) await expect(page.getByRole('heading', { level: 2, name, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'Export & import' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Export all data', exact: true })).toBeVisible();
  await expect(page.getByText('Import from file')).toBeVisible();
  await expect(page.getByText(/GitHub/i)).toHaveCount(0);
});

test('the jump row focuses the group heading and brings it into view', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  await page.getByRole('navigation', { name: 'Jump to a settings group' }).getByRole('button', { name: 'App' }).click();
  await expect(page.locator('#set-app-h')).toBeFocused();
  await expect(page.locator('#set-app-h')).toBeInViewport();
});

test('Settings does not scroll sideways on a narrow phone at a large text size', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  await openSettings(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(wide).toBe(false);
});

test('the 1RM table is folded until opened', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  const fold = page.locator('details.fold');
  await expect(fold.locator('table')).toBeHidden();
  await fold.locator('summary').click();
  await expect(fold.locator('table')).toBeVisible();
});
