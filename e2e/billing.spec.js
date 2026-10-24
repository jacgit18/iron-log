import { test, expect } from '@playwright/test';

// The Billing section in Settings (BillingPanel.tsx, ADR 065). Open to every signed-in account (the admin gate came off at go-live). There is no real API behind
// `vite preview`, so /api is scripted; Stripe's own pages are stood in for by a routed address.
const json = (body, status = 200) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const meWith = (account = {}, billing = {}) => ({
  ok: true,
  userId: 'u1',
  account: { kind: 'session', email: 'jo@example.com', name: 'Jo Lifter', isAdmin: true, isPaid: false, plan: 'free', billing: { available: true, source: 'manual', status: null, renewsAt: null, hasCustomer: false, ...billing }, ...account },
});

async function open(page, me, path = '/') {
  await page.addInitScript(() => {
    localStorage.setItem('ironlog:hidetip', '1');
    localStorage.setItem('ironlog:hidelocal', '1');
    localStorage.setItem('ironlog:flag:apiSync', 'true');
    localStorage.setItem('ironlog:session/known', 'true');
  });
  await page.route('**/api/**', json({ ok: false }, 401));
  await page.route('**/api/sync*', json({ rows: [], cursor: '0', more: false }));
  await page.route('**/api/me', typeof me === 'function' ? me : json(me));
  await page.goto(path);
  await page.locator('#account-badge').click();
}

test.describe('Billing section', () => {
  test('a free admin can subscribe: the choice goes to Checkout and the browser follows the address', async ({ page }) => {
    let asked;
    await open(page, meWith());
    await page.route('**/api/billing/checkout', route => { asked = route.request().postDataJSON(); return json({ ok: true, url: 'https://checkout.stripe.test/c/1' })(route); });
    await page.route('https://checkout.stripe.test/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Stripe stand-in</title>' }));
    await expect(page.getByRole('heading', { name: 'Billing', exact: true })).toBeVisible();
    await expect(page.getByText('Plan: Free')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Manage billing' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Subscribe yearly' }).click();
    await expect(page).toHaveURL(/checkout\.stripe\.test/);
    expect(asked).toEqual({ interval: 'year' });
  });

  test('a subscriber sees Supporter, the renewal date and Manage billing, which opens the Portal', async ({ page }) => {
    await open(page, meWith({ plan: 'paid', isPaid: true }, { source: 'stripe', status: 'active', renewsAt: '2027-01-15T12:00:00.000Z', hasCustomer: true }));
    await page.route('**/api/billing/portal', json({ ok: true, url: 'https://portal.stripe.test/p/1' }));
    await page.route('https://portal.stripe.test/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Portal stand-in</title>' }));
    await expect(page.getByText('Plan: Supporter')).toBeVisible();
    await expect(page.getByText(/Renews on .*2027/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Subscribe/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Manage billing' }).click();
    await expect(page).toHaveURL(/portal\.stripe\.test/);
  });

  test('a failed payment says so and points at Manage billing', async ({ page }) => {
    await open(page, meWith({ plan: 'paid', isPaid: true }, { source: 'stripe', status: 'past_due', renewsAt: '2027-01-15T12:00:00.000Z', hasCustomer: true }));
    await expect(page.getByText('Payment failed. Update your card in Manage billing.')).toBeVisible();
    await expect(page.getByText(/Renews on/)).toHaveCount(0);
  });

  test('a lifetime account has nothing to pay and no buttons', async ({ page }) => {
    await open(page, meWith({ plan: 'lifetime', isPaid: true }));
    await expect(page.getByText('Plan: Lifetime')).toBeVisible();
    await expect(page.getByText('Nothing to pay.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Subscribe|Manage billing/ })).toHaveCount(0);
  });

  test('Checkout failing says so and leaves the buttons usable', async ({ page }) => {
    await open(page, meWith());
    await page.route('**/api/billing/checkout', json({ ok: false, error: 'Billing is unavailable, try again' }, 502)); // after open(): the later route wins
    await page.getByRole('button', { name: 'Subscribe monthly' }).click();
    await expect(page.getByText('Billing is unavailable, try again')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Subscribe monthly' })).toBeEnabled();
  });

  test('back from Checkout, the plan is looked up again until it changes, and the address is cleaned', async ({ page }) => {
    let calls = 0;
    await open(page, route => {
      calls += 1;
      return json(calls < 3 ? meWith() : meWith({ plan: 'paid', isPaid: true }, { source: 'stripe', status: 'active', renewsAt: '2027-01-15T12:00:00.000Z', hasCustomer: true }))(route);
    }, '/?billing=success');
    await expect(page.getByText('Plan: Supporter')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Thanks. Your plan is updated.')).toBeVisible();
    expect(page.url()).not.toContain('billing=');
  });

  test('is not drawn for a non-admin, nor when the server has billing off', async ({ page }) => {
    await open(page, meWith({ isAdmin: false }, { available: false }));
    await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Billing', exact: true })).toHaveCount(0);
  });

  test('is not drawn when the server has billing off, even for an admin', async ({ page }) => {
    await open(page, meWith({}, { available: false }));
    await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Billing', exact: true })).toHaveCount(0);
  });
});
