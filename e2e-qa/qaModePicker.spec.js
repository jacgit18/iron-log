import { expect, test } from '@playwright/test';
import { markScratchAsQa, signInAsAdmin } from './qaModeAdmin.js';

// QA scenarios S-36 and S-34 on a server in QA mode (playwright.qaMode.config.js): an admin seeds the missing test accounts from the picker, switches
// to two of them, finds them under Recent, and Return to admin restores the admin's own session.
test.beforeAll(markScratchAsQa);

test('S-36 and S-34: seed the missing accounts, switch between test accounts, and return to admin', async ({ browser }) => {
  test.setTimeout(240_000);
  const { context, page } = await signInAsAdmin(browser);
  await page.locator('#account-badge').click({ timeout: 30_000 });
  await page.getByRole('button', { name: 'QA test accounts' }).click();
  const dialog = page.getByRole('dialog', { name: 'QA test accounts' });
  await expect(dialog.getByText('You are: your own account')).toBeVisible();
  // S-36: nothing is seeded yet, so Switch is off and the seed button is shown; pressing it seeds the accounts and the button goes away.
  await expect(dialog.getByRole('button', { name: 'Switch to New user' })).toBeDisabled();
  const seedAll = dialog.getByRole('button', { name: 'Seed missing accounts' });
  await expect(seedAll).toBeVisible();
  await seedAll.click();
  await expect(seedAll).toHaveCount(0, { timeout: 180_000 });
  await expect(dialog.getByRole('button', { name: 'Switch to New user' })).toBeEnabled();
  // S-36, the idle step: leave the picker alone for several minutes (the page clock is moved on 10 minutes), reopen it, and it still lists the accounts.
  await dialog.getByRole('button', { name: 'Close' }).click();
  await page.clock.fastForward('10:00');
  await page.locator('#account-badge').click();
  await page.getByRole('button', { name: 'QA test accounts' }).click();
  await expect(dialog.getByRole('button', { name: 'Switch to New user' })).toBeEnabled();
  // S-34: switch to New user, then use the banner's Switch to go to Diet, on target, then Return to admin.
  await dialog.getByRole('button', { name: 'Switch to New user' }).click();
  // There is no prompt: the app wipes this device's own data by itself after a switch (QaAccountsPanel.tsx).
  await expect(page.getByRole('button', { name: 'Switch', exact: true })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Switch', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'QA test accounts' });
  await expect(sheet.getByText('You are: New user')).toBeVisible();
  await sheet.getByRole('searchbox', { name: 'Search test accounts' }).fill('diet');
  await expect(sheet.getByRole('button', { name: 'Switch to New user' })).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Switch to Diet, on target' }).click();
  await expect(page.getByText(/Diet, on target/).first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Return to admin' }).click();
  await expect(page.getByRole('button', { name: 'Switch', exact: true })).toHaveCount(0, { timeout: 60_000 });
  await page.locator('#account-badge').click();
  await expect(page.getByRole('button', { name: 'QA test accounts' })).toBeVisible();
  await context.close();
});

// QA scenario S-100, the last step: on the QA service the app's tab is titled "... Loadbearer QA" and its icons are the QA ones.
test('S-100: a QA-mode server serves the page titled Loadbearer QA and the manifest points at the QA icons', async ({ browser }) => {
  const { context, page } = await signInAsAdmin(browser);
  await expect(page.locator('#account-badge')).toBeVisible({ timeout: 30_000 });
  // The server puts QA in the page it serves; once the app has loaded it sets its own tab title ("Board · Loadbearer"), so this reads the served page.
  expect(await (await page.request.get('/')).text()).toContain('<title>Loadbearer QA</title>');
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.icons[0].src).toBe('icons/qa/icon-192.png');
  await context.close();
});
