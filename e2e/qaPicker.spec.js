import { test, expect } from '@playwright/test';

// The QA test account picker (brief qa-picker-access): the account menu row and the banner's Switch button open one sheet. QA mode is faked by
// what /api/me and the persona list say, as the real server only does on the QA service. The rules (search, groups, recent, visibility) are unit
// tests in src/lib/qaPersonas.test.ts; this covers wiring, Back, and that a service that is not QA draws nothing.
const json = (body, status = 200) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const account = { kind: 'session', email: 'jo@example.com', name: 'Jo Lifter', isAdmin: true };
const list = {
  ok: true, current: null, canReset: true,
  personas: [
    { id: 'new-user', name: 'New user', group: 'Plans', plan: 'free', planStatus: null, scenario: 'Just signed up.', tryThis: 'Empty states.', seeded: true },
    { id: 'meal-planner', name: 'Meal planner', group: 'Diet', plan: 'free', planStatus: null, scenario: 'A 7-day plan.', tryThis: 'Portions.', seeded: false },
  ],
};

async function open(page, qa) {
  await page.addInitScript(() => {
    for (const [k, v] of [['hidetip', '1'], ['hidelocal', '1'], ['flag:apiSync', 'true'], ['session/known', 'true']]) localStorage.setItem('ironlog:' + k, v);
  });
  await page.route('**/api/**', json({ ok: false }, 401));
  await page.route('**/api/sync*', json({ rows: [], cursor: '0', more: false }));
  await page.route('**/api/me', json({ ok: true, userId: 'u1', ...(qa ? { qa } : {}), account }));
  await page.route('**/api/auth/qa/personas', json(list));
  await page.goto('/');
  await expect(page.locator('#account-badge')).toBeVisible();
}

test('the account menu row opens the picker, search narrows it, Back closes it', async ({ page }) => {
  await open(page, { persona: null, canSwitch: true });
  await page.locator('#account-badge').click();
  await page.getByRole('button', { name: 'QA test accounts' }).click();
  const dialog = page.getByRole('dialog', { name: 'QA test accounts' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('You are: your own account')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Switch to New user' })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Switch to Meal planner' })).toBeDisabled(); // not seeded
  await expect(dialog.getByRole('button', { name: 'Seed Meal planner' })).toBeEnabled();
  await dialog.getByRole('searchbox', { name: 'Search test accounts' }).fill('portions');
  await expect(dialog.getByRole('button', { name: 'Switch to New user' })).toHaveCount(0);
  await page.goBack();
  await expect(dialog).toHaveCount(0);
});

test('the banner on a test account has Switch, and it opens the same sheet', async ({ page }) => {
  await open(page, { persona: 'New user', canSwitch: false });
  await page.getByRole('button', { name: 'Switch', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'QA test accounts' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await page.locator('#account-badge').click();
  await expect(page.getByRole('button', { name: 'QA test accounts' })).toHaveCount(0); // no menu row from inside a test account
});

test('a service that is not QA draws no row and no button', async ({ page }) => {
  await open(page, undefined);
  await page.locator('#account-badge').click();
  await expect(page.getByRole('button', { name: 'QA test accounts' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Switch', exact: true })).toHaveCount(0);
});
