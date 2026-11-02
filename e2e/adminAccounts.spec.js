import { test, expect } from '@playwright/test';

// The admin Accounts page (brief admin-accounts-screen, #/settings/accounts): its address, Back, reload, who sees it, Suspend and the suspended
// notice. There is no real API behind `vite preview`, so /api is scripted. What a unit test cannot catch: the route read in Settings, Back
// from a pushed page, and that a non-admin who types the address sees Settings.
const json = (body, status = 200) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = (account = {}) => ({ ok: true, userId: 'u1', account: { kind: 'session', email: 'boss@example.com', name: 'Boss', isAdmin: true, isPaid: false, plan: 'free', ...account } });
const overview = (suspended = false) => ({
  ok: true, cap: 25,
  counts: { total: 7, paid: 2, suspended: suspended ? 1 : 0 },
  accounts: [
    { id: '15', label: 'j***@gmail.com', plan: 'free', isAdmin: false, joined: '2026-10-02T10:00:00.000Z', suspended },
    { id: '1', label: 'b***@example.com', plan: 'free', isAdmin: true, joined: '2026-09-01T10:00:00.000Z', suspended: false },
  ],
  actions: suspended ? [{ id: '3', action: 'suspend', adminId: '1', targetId: '15', at: new Date().toISOString() }] : [],
});

// `routes` adds the scripted /api/accounts answers after the catch-all (the last route registered wins) and before the page loads.
async function open(page, account, path = '/#/settings', routes = async () => {}) {
  await page.addInitScript(() => {
    localStorage.setItem('ironlog:hidetip', '1');
    localStorage.setItem('ironlog:hidelocal', '1');
    localStorage.setItem('ironlog:flag:apiSync', 'true');
    localStorage.setItem('ironlog:session/known', 'true');
  });
  await page.route('**/api/**', json({ ok: false }, 401));
  await page.route('**/api/sync*', json({ rows: [], cursor: '0', more: false }));
  await page.route('**/api/me', json(me(account)));
  await routes();
  await page.goto(path);
}

test.describe('Accounts page', () => {
  test('an admin opens it from Settings, Back returns to Settings, and a reload reopens it', async ({ page }) => {
    await open(page, {}, '/#/settings', () => page.route('**/api/accounts', json(overview())));
    await page.getByRole('button', { name: 'Open accounts' }).click();
    await expect(page).toHaveURL(/#\/settings\/accounts$/);
    await expect(page.getByRole('heading', { name: 'Newest accounts' })).toBeVisible();
    await expect(page.getByText('j***@gmail.com')).toBeVisible();
    await expect(page.getByText('7 of 25 accounts')).toBeVisible();
    // An admin account has no Suspend button.
    await expect(page.getByRole('button', { name: 'Suspend account 1', exact: true })).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/#\/settings$/);
    await expect(page.getByRole('button', { name: 'Open accounts' })).toBeVisible();
    await page.goForward();
    await page.reload();
    await expect(page).toHaveURL(/#\/settings\/accounts$/);
    await expect(page.getByRole('heading', { name: 'Newest accounts' })).toBeVisible();
  });

  test('a non-admin has no row, and the typed address shows Settings with no Accounts page', async ({ page }) => {
    await open(page, { isAdmin: false }, '/#/settings/accounts');
    await expect(page.getByRole('heading', { name: 'Backups & data' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Newest accounts' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open accounts' })).toHaveCount(0);
  });

  test('Suspend needs a second press, sends one call, and the list then shows the account suspended', async ({ page }) => {
    let suspended = false;
    const calls = [];
    await open(page, {}, '/#/settings/accounts', async () => {
      await page.route('**/api/accounts', route => json(overview(suspended))(route));
      await page.route('**/api/accounts/15/suspend', route => { calls.push('suspend'); suspended = true; return json({ ok: true, changed: true })(route); });
      await page.route('**/api/accounts/15/restore', route => { calls.push('restore'); suspended = false; return json({ ok: true, changed: true })(route); });
    });
    const suspend = page.getByRole('button', { name: 'Suspend account 15' });
    await suspend.click();
    expect(calls).toEqual([]);
    await page.getByRole('button', { name: /Press again to suspend/ }).click();
    await expect(page.getByRole('button', { name: 'Restore account 15' })).toBeVisible();
    expect(calls).toEqual(['suspend']);
    await expect(page.getByText('Suspended account 15')).toBeVisible();
    await page.getByRole('button', { name: 'Restore account 15' }).click();
    await expect(page.getByRole('button', { name: 'Suspend account 15' })).toBeVisible();
    expect(calls).toEqual(['suspend', 'restore']);
  });

  test('a failed list says so instead of showing an empty page', async ({ page }) => {
    await open(page, {}, '/#/settings/accounts', () => page.route('**/api/accounts', json({ ok: false }, 500)));
    await expect(page.getByText('Could not load the accounts. Try again.')).toBeVisible();
  });
});

test.describe('Suspended notice', () => {
  test('a suspended account sees the notice on its screens', async ({ page }) => {
    await open(page, { isAdmin: false, suspended: true }, '/');
    await expect(page.getByRole('alert').filter({ hasText: 'This account is suspended.' })).toBeVisible();
  });
  test('an account that is not suspended sees no notice', async ({ page }) => {
    await open(page, { isAdmin: false }, '/');
    await expect(page.getByText('This account is suspended.')).toHaveCount(0);
  });
});
