import { test, expect } from './fixtures.js';

// Settings > Send feedback: "Copy problem details" puts the app build and sync state on the clipboard for pasting into the form.
test('Copy problem details copies the build and sync state, and none of the logged data', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.click('#tab-settings');
  await page.getByRole('button', { name: 'Copy problem details' }).click();
  await expect(page.getByText('Details copied. Paste them into the form.')).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('Iron Log problem details');
  expect(text).toContain('App build:');
  expect(text).toContain('Sync: off (this device only)');
  expect(text).toContain('Network: online');
});

test('when the clipboard is refused the details are shown to copy by hand', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) } }); });
  await page.goto('/');
  await page.click('#tab-settings');
  await page.getByRole('button', { name: 'Copy problem details' }).click();
  await expect(page.getByLabel('Select all and copy')).toHaveValue(/Iron Log problem details/);
});
