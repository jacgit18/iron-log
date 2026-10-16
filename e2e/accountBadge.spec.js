import { test, expect } from '@playwright/test';

// The signed-in badge at the right end of the header (AccountBadge.tsx). There is no real API behind `vite preview`, so /api is scripted.
const json = (body, status = 200) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { ok: true, userId: 'u1', account: { kind: 'session', email: 'jo@example.com', name: 'Jo Lifter', isAdmin: false } };

async function open(page, who) {
  await page.addInitScript(() => {
    localStorage.setItem('ironlog:hidetip', '1');
    localStorage.setItem('ironlog:hidelocal', '1');
    localStorage.setItem('ironlog:flag:apiSync', 'true');
    localStorage.setItem('ironlog:session/known', 'true');
  });
  await page.route('**/api/**', json({ ok: false }, 401));
  await page.route('**/api/sync*', json({ rows: [], cursor: '0', more: false })); // a signed-in server answers pulls, or sync pauses for auth and the badge hides
  await page.route('**/api/me', who);
  await page.goto('/');
}

test.describe('signed-in badge', () => {
  test('shows who is signed in, and opens Settings', async ({ page }) => {
    await open(page, json(me));
    const badge = page.getByRole('button', { name: /Signed in as Jo Lifter/ });
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('Jo Lifter'); // desktop: the name is beside the initial
    await expect(page.locator('#tab-settings')).toHaveCount(0); // the badge is the way to Settings, so the tab is not drawn
    await badge.click();
    await expect(badge).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible();
    await expect(page.locator('#tab-board')).toHaveAttribute('aria-selected', 'false');
  });

  test('the other four tabs still work from the keyboard without the Settings tab', async ({ page }) => {
    await open(page, json(me));
    await expect(page.locator('#account-badge')).toBeVisible();
    await page.locator('#tab-progress').click();
    await page.locator('#tab-progress').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#tab-program')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight'); // wraps to the first tab, not to a hidden one
    await expect(page.locator('#tab-board')).toHaveAttribute('aria-selected', 'true');
  });

  test('on Settings, reached through the badge, the tab list is still reachable by keyboard and the panel has a name', async ({ page }) => {
    await open(page, json(me));
    await page.locator('#account-badge').click();
    await expect(page.locator('#view')).toHaveAttribute('aria-label', 'Settings');
    await expect(page.locator('#view')).not.toHaveAttribute('aria-labelledby', /.+/); // it does not point at a tab that is not drawn
    await expect(page.locator('#tab-board')).toHaveAttribute('tabindex', '0'); // no tab is selected, so the first one is the way in
    await page.locator('#account-badge').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#tab-board')).toBeFocused();
    await page.keyboard.press('ArrowRight'); // from the tab that has focus
    await expect(page.locator('#tab-daily')).toHaveAttribute('aria-selected', 'true');
  });

  test('the tab bar does not change shape when the answer arrives: Settings is not drawn while it is awaited', async ({ page }) => {
    await page.addInitScript(() => { for (const [k, v] of [['hidetip', '1'], ['hidelocal', '1'], ['flag:apiSync', 'true'], ['session/known', 'true']]) localStorage.setItem('ironlog:' + k, v); });
    await page.route('**/api/**', json({ ok: false }, 401));
    await page.route('**/api/sync*', json({ rows: [], cursor: '0', more: false }));
    await page.route('**/api/me', async route => { await new Promise(r => setTimeout(r, 1500)); await json(me)(route); });
    await page.goto('/');
    await expect(page.locator('#tab-board')).toBeVisible();
    await expect(page.locator('#tab-settings')).toHaveCount(0); // still waiting for /api/me: already the final shape
    await expect(page.locator('#account-badge')).toBeVisible();
    await expect(page.locator('#tab-settings')).toHaveCount(0);
  });

  test('is not there when signed out or when the server cannot be reached', async ({ page }) => {
    await open(page, json({ ok: false }, 401));
    await expect(page.locator('#tab-board')).toBeVisible();
    await expect(page.locator('#tab-settings')).toBeVisible(); // nobody to show a badge for, so Settings keeps its tab
    await expect(page.locator('#account-badge')).toHaveCount(0);
  });

  test('on a phone it is the initial and a dot on the same row as Help, within the screen', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await open(page, json(me));
    const badge = page.locator('#account-badge');
    await expect(badge).toBeVisible();
    await expect(page.locator('.acctname')).toBeHidden();
    const b = await badge.boundingBox();
    const h = await page.locator('#help-btn').boundingBox();
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs(b.y - h.y)).toBeLessThan(4); // one row
    expect(b.x + b.width).toBeLessThanOrEqual(360);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  });
});
