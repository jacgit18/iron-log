import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

// The public Plans page (/plans) and the landing page without it. What a unit test cannot catch here: the real address reaching the page
// through the built app and the preview server, the link between the two pages, and the Android referrer turning the page and its link off.
// There is no real API behind `vite preview`, so every /api call answers "signed out".
const scan = page => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
const json = (status, body) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const LANDING = /A weekly training board/;
const ANDROID = 'android-app://app.loadbearer';

async function stranger(page) {
  await page.addInitScript(() => { localStorage.setItem('ironlog:hidetip', '1'); localStorage.setItem('ironlog:hidelocal', '1'); localStorage.setItem('ironlog:flag:apiSync', 'true'); });
  await page.route('**/api/**', json(401, { ok: false, error: 'sign-in required' }));
  await page.route('**/api/auth-options', json(200, { ok: true, emailCode: false }));
}

test.describe('plans page', () => {
  test('is a public page of its own, with no app behind it', async ({ page }) => {
    await stranger(page);
    await page.goto('/plans');
    await expect(page.getByRole('heading', { level: 1, name: 'Plans' })).toBeVisible();
    await expect(page).toHaveTitle('Plans · Loadbearer');
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page.getByText('Free during the beta')).toBeVisible();
    expect(await scan(page).then(r => r.violations)).toEqual([]);
  });

  test('opens for a browser that is already signed in, without asking the server who it is', async ({ page }) => {
    const asked = [];
    page.on('request', r => { if (new URL(r.url()).pathname === '/api/me') asked.push(r.url()); });
    await stranger(page);
    await page.addInitScript(() => localStorage.setItem('ironlog:session/known', 'true')); // a browser that has been signed in before
    await page.goto('/plans');
    await expect(page.getByRole('heading', { level: 1, name: 'Plans' })).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(0); // the page, not the app
    await expect(page.getByRole('link', { name: 'Back to Loadbearer' })).toBeVisible();
    expect(asked).toEqual([]);
  });

  test('is reached from the landing page, which no longer holds the plans', async ({ page }) => {
    await stranger(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: LANDING })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Plans' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Plans' }).click();
    await expect(page).toHaveURL(/\/plans$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Plans' })).toBeVisible();
    await page.getByRole('link', { name: 'Back to Loadbearer' }).click();
    await expect(page.getByRole('heading', { level: 1, name: LANDING })).toBeVisible();
  });

  test('is not offered inside the Android app: no link, and the address goes back to the landing page', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await stranger(page);
    // A Trusted Web Activity launch sets document.referrer to android-app://<package> on the first load only. An HTTP header cannot carry
    // that scheme, so the first load of this window gets the value from a script, and a reload gets the real (empty) one.
    await page.addInitScript(ref => {
      if (sessionStorage.getItem('e2e-referrer-used')) return;
      sessionStorage.setItem('e2e-referrer-used', '1');
      Object.defineProperty(document, 'referrer', { get: () => ref });
    }, ANDROID);
    await page.goto('/plans');
    await expect(page.getByRole('heading', { level: 1, name: LANDING })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('link', { name: 'Plans' })).toHaveCount(0);
    await page.reload(); // the referrer is gone on a reload; the session remembers it
    await expect(page.getByRole('heading', { level: 1, name: LANDING })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Plans' })).toHaveCount(0);
    await ctx.close();
  });
});
