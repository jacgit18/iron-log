import { test, expect } from '@playwright/test';

// Delete forever on the admin Accounts page (brief admin-delete-account): who gets the control, the typed-number form, and the call. There is no
// real API behind `vite preview`, so /api is scripted. What a unit test cannot catch: the control on the right rows only, the disabled state while
// typing, focus, and that Cancel sends nothing.
const json = (body, status = 200) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { ok: true, userId: 'u1', account: { kind: 'session', email: 'boss@example.com', name: 'Boss', isAdmin: true, isPaid: false, plan: 'free' } };
const row = (id, label, extra = {}) => ({ id, label, plan: 'free', isAdmin: false, joined: '2026-10-02T10:00:00.000Z', suspended: false, ...extra });
const overview = (rows, actions = []) => ({ ok: true, cap: 25, counts: { total: rows.length, paid: 0, suspended: rows.filter(r => r.suspended).length }, accounts: rows, actions });

async function open(page, routes) {
  await page.addInitScript(() => {
    localStorage.setItem('ironlog:hidetip', '1');
    localStorage.setItem('ironlog:hidelocal', '1');
    localStorage.setItem('ironlog:flag:apiSync', 'true');
    localStorage.setItem('ironlog:session/known', 'true');
  });
  await page.route('**/api/**', json({ ok: false }, 401));
  await page.route('**/api/sync*', json({ rows: [], cursor: '0', more: false }));
  await page.route('**/api/me', json(me));
  await routes();
  await page.goto('/#/settings/accounts');
}

test.describe('Delete forever', () => {
  test('only a suspended, non-admin row has the control', async ({ page }) => {
    await open(page, () => page.route('**/api/accounts', json(overview([row('15', 'j***@gmail.com', { suspended: true }), row('16', 'k***@gmail.com'), row('1', 'b***@example.com', { isAdmin: true })]))));
    await expect(page.getByRole('button', { name: 'Delete forever account 15', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete forever account 16', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete forever account 1', exact: true })).toHaveCount(0);
  });

  test('the form needs the exact number, Cancel sends nothing, and the confirmed call removes the row', async ({ page }) => {
    let deleted = false;
    const calls = [];
    await open(page, async () => {
      await page.route('**/api/accounts', route => json(overview(deleted ? [row('16', 'k***@gmail.com')] : [row('15', 'j***@gmail.com', { suspended: true }), row('16', 'k***@gmail.com')], deleted ? [{ id: '9', action: 'delete', adminId: '1', targetId: null, at: new Date().toISOString() }] : []))(route));
      await page.route('**/api/accounts/15/delete', route => { calls.push(route.request().postDataJSON()); deleted = true; return json({ ok: true })(route); });
    });
    await page.getByRole('button', { name: 'Delete forever account 15', exact: true }).click();
    const field = page.getByLabel('Account number');
    await expect(field).toBeFocused();
    const confirm = page.getByRole('button', { name: 'Confirm delete forever account 15' });
    await expect(confirm).toBeDisabled();
    await field.fill('1');
    await expect(confirm).toBeDisabled();
    await field.fill('150');
    await expect(confirm).toBeDisabled();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(field).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete forever account 15', exact: true })).toBeFocused();
    expect(calls).toEqual([]);
    await page.getByRole('button', { name: 'Delete forever account 15', exact: true }).click();
    await page.getByLabel('Account number').fill('15');
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(page.getByText('j***@gmail.com')).toHaveCount(0);
    await expect(page.getByText('Deleted an account')).toBeVisible();
    expect(calls).toEqual([{ confirm: '15' }]);
  });

  test('says nothing was deleted when the subscription could not be cancelled', async ({ page }) => {
    await open(page, async () => {
      await page.route('**/api/accounts', json(overview([row('15', 'j***@gmail.com', { suspended: true })])));
      await page.route('**/api/accounts/15/delete', json({ ok: false }, 503));
    });
    await page.getByRole('button', { name: 'Delete forever account 15', exact: true }).click();
    await page.getByLabel('Account number').fill('15');
    await page.getByRole('button', { name: 'Confirm delete forever account 15' }).click();
    await expect(page.getByText('Could not cancel the subscription, so nothing was deleted. Try again.')).toBeVisible();
    await expect(page.getByText('j***@gmail.com')).toBeVisible();
  });
});
