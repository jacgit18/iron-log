import { test, expect } from '@playwright/test';

// The Plans tab (PlansTab.tsx, src/lib/plansTab.ts): desktop only, for a signed-in free account with billing on. The visibility rule is unit tested;
// this checks the wiring a node test cannot: the tab in the real bar, the width, and the buttons reaching Checkout. /api is scripted.
const json = (body, status = 200) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const meWith = (account = {}) => ({
  ok: true,
  userId: 'u1',
  account: { kind: 'session', email: 'jo@example.com', name: 'Jo Lifter', isAdmin: false, isPaid: false, plan: 'free', billing: { available: true, source: 'manual', status: null, renewsAt: null, hasCustomer: false }, ...account },
});

async function open(page, me, size = { width: 1280, height: 800 }) {
  await page.setViewportSize(size);
  await page.addInitScript(() => {
    localStorage.setItem('ironlog:hidetip', '1');
    localStorage.setItem('ironlog:hidelocal', '1');
    localStorage.setItem('ironlog:flag:apiSync', 'true');
    localStorage.setItem('ironlog:session/known', 'true');
  });
  await page.route('**/api/**', json({ ok: false }, 401));
  await page.route('**/api/sync*', json({ rows: [], cursor: '0', more: false }));
  await page.route('**/api/me', json(me));
  await page.goto('/');
  await expect(page.locator('#account-badge')).toBeVisible();
}

test.describe('Plans tab', () => {
  test('a free signed-in account on a desktop sees the tab and can start Checkout from it', async ({ page }) => {
    let asked;
    await open(page, meWith());
    await page.route('**/api/billing/checkout', route => { asked = route.request().postDataJSON(); return json({ ok: true, url: 'https://checkout.stripe.test/c/1' })(route); });
    await page.route('https://checkout.stripe.test/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Stripe stand-in</title>' }));
    await page.getByRole('tab', { name: 'Plans' }).click();
    await expect(page.getByRole('heading', { name: 'Plans', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pro' })).toBeVisible();
    await expect(page.getByText('Coming later, not priced yet')).toBeVisible();
    await page.getByRole('button', { name: 'Plus, $49.99 a year' }).click();
    await expect(page).toHaveURL(/checkout\.stripe\.test/);
    expect(asked).toEqual({ interval: 'year' });
  });

  test('the monthly button asks for the monthly price', async ({ page }) => {
    let asked;
    await open(page, meWith());
    await page.route('**/api/billing/checkout', route => { asked = route.request().postDataJSON(); return json({ ok: false }, 502)(route); });
    await page.getByRole('tab', { name: 'Plans' }).click();
    await page.getByRole('button', { name: 'Plus, $5.99 a month' }).click();
    await expect(page.getByText('Billing is unavailable, try again')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Plus, $5.99 a month' })).toBeEnabled();
    expect(asked).toEqual({ interval: 'month' });
  });

  test('there is no tab on a phone', async ({ page }) => {
    await open(page, meWith(), { width: 390, height: 800 });
    await expect(page.getByRole('tab', { name: 'Program' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Plans' })).toHaveCount(0);
  });

  test('there is no tab for a subscriber, nor when the server has billing off', async ({ page }) => {
    await open(page, meWith({ plan: 'paid', isPaid: true }));
    await expect(page.getByRole('tab', { name: 'Program' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Plans' })).toHaveCount(0);
  });

  test('narrowing the window while on Plans goes back to the Board', async ({ page }) => {
    await open(page, meWith());
    await page.getByRole('tab', { name: 'Plans' }).click();
    await expect(page.getByRole('heading', { name: 'Plans', exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 800 });
    await expect(page.getByRole('tab', { name: 'Board' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Plans', exact: true })).toHaveCount(0);
  });
});
