import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// The 404 page (public/404.html) is a static file; the server's status code and the path allowlist are covered by server/static.test.ts and
// src/lib/pagePaths.test.ts. `vite preview` answers every path with the app, so this checks what a node test cannot: the real page in a
// real browser, in both colour schemes: one heading, a way back that is a 44 px target, no script, and no accessibility violations.
for (const scheme of ['light', 'dark']) {
  test(`the 404 page reads and passes axe in ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/404.html');
    await expect(page.locator('h1')).toHaveText('Page not found');
    const link = page.getByRole('link', { name: 'Go to Loadbearer' });
    await expect(link).toHaveAttribute('href', '/');
    expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(await page.locator('script').count()).toBe(0);
    await link.focus();
    await expect(link).toBeFocused();
    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(scan.violations).toEqual([]);
  });
}
