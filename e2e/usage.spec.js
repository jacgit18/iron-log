import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

// Opt-in anonymous usage counts (brief opt-in-usage-counts), from the phone's side. Every /api/usage and /api/usage-admin call is recorded and
// answered here, so what reaches the server is what is checked. Unit tests cover the rules; this covers the wiring: the switch, the one request a
// day, and the admin-only view.
const OVERVIEW = {
  ok: true,
  installs: 3,
  days: [{ day: '2026-10-28', installs: 2, fromApp: 1 }, { day: '2026-10-27', installs: 1, fromApp: 0 }],
  retention: [{ after: 1, eligible: 2, returned: 1 }, { after: 7, eligible: 0, returned: 0 }, { after: 14, eligible: 0, returned: 0 }],
  features: [{ version: '11', event: 'app_open', total: 9 }, { version: '11', event: 'workout_logged', total: 4 }],
};

async function setup(page, { admin = false } = {}) {
  const sent = [];
  const reads = [];
  await page.addInitScript(({ admin }) => {
    localStorage.setItem('ironlog:hidetip', '1');
    localStorage.setItem('ironlog:hidelocal', '1');
    if (admin) localStorage.setItem('ironlog:session/admin', 'true');
  }, { admin });
  await page.route('**/api/usage', route => {
    sent.push(JSON.parse(route.request().postData() ?? 'null'));
    return route.fulfill({ status: 204 });
  });
  await page.route('**/api/usage-admin**', route => {
    reads.push(new URL(route.request().url()).search);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OVERVIEW) });
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  return { sent, reads };
}
const openSettings = page => page.locator('#tab-settings, #account-badge').first().click();
const toggle = page => page.getByRole('checkbox', { name: 'Share anonymous usage counts' });
const usageKeys = page => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('ironlog:usage:')));

test('it is off by default: nothing is sent and nothing is kept, also after a reload', async ({ page }) => {
  const { sent } = await setup(page);
  await openSettings(page);
  await expect(toggle(page)).not.toBeChecked();
  await page.reload();
  await page.waitForLoadState('networkidle').catch(() => {});
  expect(sent).toEqual([]);
  expect(await usageKeys(page)).toEqual([]);
});

test('switched on, the next open sends one report with only the allowed fields, and not another the same day', async ({ page }) => {
  const { sent } = await setup(page);
  await openSettings(page);
  await toggle(page).check();
  expect(sent).toEqual([]); // nothing goes at the moment of switching on
  await page.reload();
  await expect.poll(() => sent.length).toBe(1);
  expect(Object.keys(sent[0]).sort()).toEqual(['counts', 'fromApp', 'id', 'version']);
  expect(sent[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  expect(sent[0].fromApp).toBe(false);
  expect(sent[0].counts.app_open).toBeGreaterThanOrEqual(1);
  expect(JSON.stringify(sent[0])).not.toMatch(/@|name|email/);
  await page.reload();
  await page.waitForLoadState('networkidle').catch(() => {});
  expect(sent).toHaveLength(1);
});

test('switched off again, the phone forgets its id and its counts and sends nothing more', async ({ page }) => {
  const { sent } = await setup(page);
  await openSettings(page);
  await toggle(page).check();
  expect((await usageKeys(page)).length).toBeGreaterThan(0);
  await toggle(page).uncheck();
  expect(await usageKeys(page)).toEqual([]);
  await page.reload();
  await page.waitForLoadState('networkidle').catch(() => {});
  expect(sent).toEqual([]);
  await openSettings(page);
  await expect(toggle(page)).not.toBeChecked();
});

test('an admin sees the Usage view, loaded only when asked; anyone else never sees it or calls the API', async ({ page }) => {
  const { reads } = await setup(page, { admin: true });
  await openSettings(page);
  const panel = page.getByRole('region', { name: 'Usage', exact: true });
  await expect(panel).toBeVisible();
  expect(reads).toEqual([]);
  await panel.getByRole('button', { name: 'Show usage' }).click();
  await expect(panel.getByRole('table', { name: /Return rate/ })).toBeVisible();
  await expect(panel.getByRole('row', { name: /1 day 1 2 50%/ })).toBeVisible();
  await expect(panel.getByRole('table', { name: /Feature counts/ })).toBeVisible();
  expect(reads).toEqual(['?days=30']);
});

test('a non-admin has the switch but not the admin view', async ({ page }) => {
  const { reads } = await setup(page);
  await openSettings(page);
  await expect(toggle(page)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Usage', exact: true })).toHaveCount(0);
  expect(reads).toEqual([]);
});

for (const colorScheme of ['light', 'dark']) {
  test(`the switch and the admin view have no accessibility violations (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await setup(page, { admin: true });
    await openSettings(page);
    await page.getByRole('region', { name: 'Usage', exact: true }).getByRole('button', { name: 'Show usage' }).click();
    await expect(page.getByRole('table', { name: /Return rate/ })).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).include('#usage-h, #usage-admin-h, .usage').analyze();
    expect(violations).toEqual([]);
  });
}
