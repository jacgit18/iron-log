import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

// Syncing through the API is behind a flag (feature-flags.md). These run with it on and the API answering as scripted;
// there is no real API behind `vite preview`, so every /api request is intercepted.
const scan = page => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

async function open(page, answer) {
  await page.addInitScript(() => {
    localStorage.setItem('ironlog:hidetip', '1');
    localStorage.setItem('ironlog:hidelocal', '1');
    localStorage.setItem('ironlog:flag:apiSync', 'true');
  });
  await page.route('**/api/**', answer);
  await page.goto('/');
}

test.describe('an app the server says is too old (426)', () => {
  const tooOld = route => route.fulfill({
    status: 426,
    contentType: 'application/json',
    headers: { 'x-min-client-version': '9999999999' },
    body: JSON.stringify({ ok: false, error: 'update-required', minClientVersion: 9999999999 }),
  });

  test('says an update is needed, and that nothing is lost', async ({ page }) => {
    await open(page, tooOld);
    const notice = page.getByRole('alert').filter({ hasText: 'Update needed' });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Your changes are kept on this device');
    await expect(notice.getByRole('button', { name: 'Reload to update' })).toBeVisible();
  });

  test('has no accessibility violations with the notice showing', async ({ page }) => {
    await open(page, tooOld);
    await expect(page.getByRole('alert').filter({ hasText: 'Update needed' })).toBeVisible();
    const { violations } = await scan(page);
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
});

test('with the flag on and the server answering, the app finishes loading and shows no notice', async ({ page }) => {
  await open(page, route => {
    const url = route.request().url();
    if (url.includes('/api/sync')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], cursor: '0', more: false }) });
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  await expect(page.locator('#chk-A-d1s1')).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Update needed' })).toHaveCount(0);
  await page.locator('#chk-A-d1s1').check(); // writes go out as commands; the 404 is a server problem, so they wait and nothing breaks
  await expect(page.locator('#chk-A-d1s1')).toBeChecked();
});
