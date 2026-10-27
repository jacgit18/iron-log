import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

// The public page Google Play's Data safety form links to (/delete-account). No sign-in and no script: the page is a plain file, so it is read
// here with JavaScript off and a fresh browser (nothing stored). What a unit test cannot catch: that the address the store links to returns this
// page and not the app from the real preview build, how it looks at phone width and in dark mode, and the colour contrast and target sizes.
// The words themselves (path in Settings, retention, contact) are checked against the code and the policy in server/legal.test.ts.
const scan = page => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
const found = violations => violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`);

test.describe('the account-deletion page', () => {
  test.describe('with script off', () => {
  test.use({ javaScriptEnabled: false });

  test('opens at /delete-account signed out, without script, and names the app, the in-app path, the email and what is kept', async ({ page }) => {
    const res = await page.goto('/delete-account');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: 'Delete your Loadbearer account' })).toBeVisible();
    for (const name of ['1. Delete it yourself in the app', '2. Ask by email, without signing in', '3. What is deleted', '4. What is kept, and for how long']) {
      await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
    }
    await expect(page.getByText('Erase & delete').first()).toBeVisible();
    await expect(page.getByText('Delete my account permanently').first()).toBeVisible();
    await expect(page.getByRole('cell', { name: /Nightly backups/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'hello@loadbearer.app' }).first()).toHaveAttribute('href', /^mailto:hello@loadbearer\.app/);
    await expect(page.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', 'privacy.html');
    expect(await page.title()).toContain('Delete your account');
    // The page, not the app: the app's root element is absent.
    await expect(page.locator('#root')).toHaveCount(0);
  });

  });

  // axe runs inside the page, so these keep script on; the page itself has none.
  for (const scheme of ['light', 'dark']) {
    test(`has no accessibility violations in ${scheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/delete-account');
      const { violations } = await scan(page);
      expect(found(violations)).toEqual([]);
    });
  }

  test('fits a 320px phone without sideways scroll, and the links you tap are at least 44px tall', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/delete-account');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    for (const loc of [page.getByRole('link', { name: '← Back to Loadbearer' }), page.locator('a.mail')]) {
      const box = await loc.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });

  test('the same file is also reachable as /delete-account.html', async ({ page }) => {
    const res = await page.goto('/delete-account.html');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Delete your Loadbearer account');
  });
});
