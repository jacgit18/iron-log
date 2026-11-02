import { test, expect } from '@playwright/test';

// A visitor this browser has never seen signed in gets the landing page, which loads as its own chunk (main.tsx).
// Syncing is switched on the way the deployed build has it, and who-is-signed-in is answered by the test.
const syncOn = page => page.addInitScript(() => { localStorage.setItem('ironlog:flag:apiSync', 'true'); localStorage.setItem('ironlog:hidetip', '1'); });
const signedOut = page => page.route('**/api/me', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"signed out"}' }));

test('a signed-out visitor gets the landing page and not the Board', async ({ page }) => {
  await syncOn(page); await signedOut(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /weekly training board/i })).toBeVisible();
  await expect(page.getByRole('tab', { name: /board/i })).toHaveCount(0);
});

test('an unreachable check on a device with no account shows the landing page with the offline note', async ({ page }) => {
  await syncOn(page);
  await page.route('**/api/me', route => route.abort('failed'));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /weekly training board/i })).toBeVisible();
  await expect(page.getByText('You are offline.')).toBeVisible();
});

test('if the landing chunk cannot load, the splash stays and nothing crashes', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await syncOn(page); await signedOut(page);
  await page.route('**/assets/Landing-*.js', route => route.abort('failed'));
  await page.goto('/');
  await expect(page.getByRole('status').filter({ hasText: 'Loading…' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: /weekly training board/i })).toHaveCount(0);
  expect(errors).toEqual([]);
});
