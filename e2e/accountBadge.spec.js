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
  await page.route('**/api/me', who);
  await page.goto('/');
}

test.describe('signed-in badge', () => {
  test('shows who is signed in, and opens Settings', async ({ page }) => {
    await open(page, json(me));
    const badge = page.getByRole('button', { name: /Signed in as Jo Lifter/ });
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('Jo Lifter'); // desktop: the name is beside the initial
    await badge.click();
    await expect(page.locator('#tab-settings')).toHaveAttribute('aria-selected', 'true');
  });

  test('is not there when signed out or when the server cannot be reached', async ({ page }) => {
    await open(page, json({ ok: false }, 401));
    await expect(page.locator('#tab-board')).toBeVisible();
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
