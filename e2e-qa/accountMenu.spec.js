import { expect, test } from '@playwright/test';
import { signInAs } from './persona.js';

// QA scenario S-32 (New user): the account menu lists the Settings groups and Sign out; a row opens Settings at that group; Escape closes it and
// puts focus back on the badge.
test('S-32: the account menu opens a Settings group, and Escape closes it and returns focus to the badge', async ({ browser }) => {
  const { context, page } = await signInAs(browser, 'new-user');
  const badge = page.locator('#account-badge');
  await expect(badge).toBeVisible({ timeout: 30_000 });
  await badge.click();
  const menu = page.getByRole('group', { name: 'Account menu' });
  await expect(menu.getByRole('button', { name: 'Data' })).toBeVisible();
  await expect(menu.getByRole('button', { name: /Sign out/ })).toBeVisible();
  await menu.getByRole('button', { name: 'Data' }).click();
  await expect(page.getByRole('heading', { name: /Data/ }).first()).toBeVisible();
  await badge.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(badge).toBeFocused();
  await context.close();
});
