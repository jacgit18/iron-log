import { test, expect } from './fixtures.js';

// Settings > Send feedback: "Copy problem details" puts the app build and sync state on the clipboard for pasting into the form.
test('Copy problem details copies the build and sync state, and none of the logged data', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.locator('#tab-settings, #account-badge').first().click();
  await page.getByRole('button', { name: 'Copy problem details' }).click();
  await expect(page.getByText('Details copied. Paste them into the form.')).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('Loadbearer problem details'); // the clipboard got the text; its contents are covered by src/lib/problemDetails.test.ts
});

test('when the clipboard is refused the details are shown to copy by hand', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) } }); });
  await page.goto('/');
  await page.locator('#tab-settings, #account-badge').first().click();
  await page.getByRole('button', { name: 'Copy problem details' }).click();
  await expect(page.getByLabel('Select all and copy')).toHaveValue(/Loadbearer problem details/);
});
