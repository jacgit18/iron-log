import { test, expect } from '@playwright/test';

// The account menu beside the signed-in badge (AccountBadge.tsx): a dropdown on desktop, a bottom sheet on a phone. It exists to reach a Settings
// group from anywhere, so these cover wiring and layout (the group list and the wait for the heading are unit tests in settingsGroups.test.ts).
const json = (body, status = 200) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { ok: true, userId: 'u1', account: { kind: 'session', email: 'jo@example.com', name: 'Jo Lifter', isAdmin: false } };

let meCalls = 0;
async function open(page) {
  meCalls = 0;
  await page.addInitScript(() => {
    for (const [k, v] of [['hidetip', '1'], ['hidelocal', '1'], ['flag:apiSync', 'true'], ['session/known', 'true']]) localStorage.setItem('ironlog:' + k, v);
  });
  await page.route('**/api/**', json({ ok: false }, 401));
  await page.route('**/api/sync*', json({ rows: [], cursor: '0', more: false }));
  await page.route('**/api/me', route => { meCalls++; return json(me)(route); });
  await page.goto('/');
  await expect(page.locator('#account-badge')).toBeVisible();
}

test('the menu lists the groups, opens Settings at the chosen one from another tab, and closes', async ({ page }) => {
  await open(page);
  await page.locator('#tab-progress').click();
  await page.locator('#account-badge').click();
  const menu = page.getByRole('group', { name: 'Account menu' });
  await expect(menu.getByRole('button')).toHaveText(['Training', 'Data', 'App', 'Erase & delete', 'Sign out']);
  await expect(menu).toContainText('jo@example.com');
  await menu.getByRole('button', { name: 'App' }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.locator('#set-app-h')).toBeFocused();
  await expect(page.locator('.sjump')).toBeVisible(); // on a wide screen the jump row is the rail beside the groups, menu or not
});

test('Escape and a tap outside close it, and Escape returns focus to the button', async ({ page }) => {
  await open(page);
  const btn = page.locator('#account-badge');
  await btn.click();
  await expect(btn).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  await expect(btn).toBeFocused();
  await btn.click();
  await page.locator('h1').click();
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
});

test('on a phone it is a bottom sheet with 44px rows, and the scrim closes it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.locator('#account-badge').click();
  const menu = page.getByRole('group', { name: 'Account menu' });
  const box = await menu.boundingBox();
  expect(box.width).toBeGreaterThan(385);
  expect(Math.round(box.y + box.height)).toBe(844); // sits on the bottom edge
  for (const b of await menu.getByRole('button').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await page.mouse.click(195, 100); // the scrim above the sheet
  await expect(menu).toHaveCount(0);
});

test('opening Settings signed in draws no Account panel at any point and does not ask who is signed in again', async ({ page }) => {
  await open(page);
  await page.waitForLoadState('networkidle');
  const before = meCalls;
  await page.locator('#account-badge').click();
  await page.getByRole('group', { name: 'Account menu' }).getByRole('button', { name: 'Data' }).click();
  await expect(page.getByRole('heading', { name: 'Backups & data' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Account', exact: true })).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(meCalls).toBe(before); // App's answer is shared with the panels, which used to ask again each
});

test('choosing a group while a Training screen is open closes the screen and lands on the group', async ({ page }) => {
  await open(page);
  await page.locator('#account-badge').click();
  await page.getByRole('group', { name: 'Account menu' }).getByRole('button', { name: 'Data' }).click();
  await page.locator('#drill-phases').click();
  await expect(page.locator('#rest-s')).toBeVisible();
  await page.locator('#account-badge').click();
  await page.getByRole('group', { name: 'Account menu' }).getByRole('button', { name: 'App' }).click();
  await expect(page.locator('#rest-s')).toHaveCount(0);
  await expect(page.locator('#set-app-h')).toBeFocused();
});

test('on a phone the account menu replaces the jump row on Settings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.locator('#account-badge').click();
  await page.getByRole('group', { name: 'Account menu' }).getByRole('button', { name: 'Data' }).click();
  await expect(page.getByRole('heading', { name: 'Backups & data' })).toBeVisible();
  await expect(page.locator('.sjump')).toBeHidden();
});
