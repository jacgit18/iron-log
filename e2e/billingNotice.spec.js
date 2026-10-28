import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// The one-time "Plus is here" notice (BillingNotice.tsx, src/lib/billingNotice.ts). Privacy section 14 and Terms section 2 promise it. It is drawn inside
// the Billing section, so it shows only to a signed-in person whose server has billing on, once per browser.
const json = (body, status = 200) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = (account = {}, billing = {}) => ({
  ok: true,
  userId: 'u1',
  account: { kind: 'session', email: 'jo@example.com', name: 'Jo Lifter', isAdmin: true, isPaid: false, plan: 'free', billing: { available: true, source: 'manual', status: null, renewsAt: null, hasCustomer: false, ...billing }, ...account },
});

async function open(page, answer, { toSettings = true } = {}) {
  await page.addInitScript(() => {
    localStorage.setItem('ironlog:hidetip', '1');
    localStorage.setItem('ironlog:hidelocal', '1');
    localStorage.setItem('ironlog:flag:apiSync', 'true');
    localStorage.setItem('ironlog:session/known', 'true');
  });
  await page.route('**/api/**', json({ ok: false }, 401));
  await page.route('**/api/sync*', json({ rows: [], cursor: '0', more: false }));
  await page.route('**/api/me', answer);
  await page.goto('/');
  if (toSettings) await page.locator('#account-badge').click();
}

const notice = page => page.getByText(/Plus is here/);

test.describe('the one-time billing notice', () => {
  test('shows once to a signed-in account with billing on, and stays gone after Dismiss, also after a reload', async ({ page }) => {
    await open(page, json(me()));
    await expect(page.getByRole('heading', { name: 'Billing', exact: true })).toBeVisible();
    await expect(notice(page)).toBeVisible();
    await expect(page.getByText(/Nothing changes unless you subscribe/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Read the updated Terms' })).toHaveAttribute('href', '/terms.html');
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(notice(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Plus, $5.99 a month' })).toBeVisible(); // the Billing section itself stays
    await page.reload();
    await page.locator('#account-badge').click();
    await expect(page.getByRole('heading', { name: 'Billing', exact: true })).toBeVisible();
    await expect(notice(page)).toHaveCount(0);
  });

  test('shows to every kind of plan, not only a free one', async ({ page }) => {
    await open(page, json(me({ plan: 'founder', isPaid: true })));
    await expect(page.getByText('Nothing to pay.')).toBeVisible();
    await expect(notice(page)).toBeVisible();
  });

  test('is not shown when the server has billing off, so it never announces a plan that is not there', async ({ page }) => {
    await open(page, json(me({}, { available: false })));
    await expect(page.getByRole('heading', { name: 'Billing', exact: true })).toHaveCount(0);
    await expect(notice(page)).toHaveCount(0);
  });

  test('is not shown to someone who is not signed in', async ({ page }) => {
    await open(page, json({ ok: false, error: 'sign-in required' }, 401), { toSettings: false }); // no account badge to open Settings from
    await expect(page.getByRole('heading', { name: 'Billing', exact: true })).toHaveCount(0);
    await expect(notice(page)).toHaveCount(0);
  });

  test('with storage that refuses the write it still hides on Dismiss for the visit, and comes back on the next', async ({ page }) => {
    await open(page, json(me()));
    await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('storage blocked'); }; });
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(notice(page)).toHaveCount(0);
    await page.reload();
    await page.locator('#account-badge').click();
    await expect(notice(page)).toBeVisible();
  });

  test('inside the Android app Settings draws no Billing section, so no prices, Subscribe buttons or notice', async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('fromAndroidApp', '1'));
    await open(page, json(me()));
    await expect(page.getByRole('heading', { name: 'Backups & data' })).toBeVisible(); // Settings is open
    await expect(page.getByRole('heading', { name: 'Billing', exact: true })).toHaveCount(0); // Settings.tsx leaves BillingPanel out (0bfa7771)
    await expect(notice(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Plus,/ })).toHaveCount(0);
  });

  test('has no accessibility violations, with the notice showing', async ({ page }) => {
    await open(page, json(me()));
    const section = page.locator('section[aria-labelledby="billing-h"]');
    await expect(notice(page)).toBeVisible();
    const result = await new AxeBuilder({ page }).include('section[aria-labelledby="billing-h"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(result.violations).toEqual([]);
    await expect(section).toBeVisible();
  });
});
