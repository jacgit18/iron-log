import { test, expect } from '@playwright/test';

// Settings → Backups & data (BackupCopies.tsx): the newest 10 copies show and "Show all N copies" opens the rest; a free account's panel has
// no account wording. The account list is scripted because `vite preview` has no API. The clock is fixed at Sep 24 2026.
const json = (body, status = 200) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = isPaid => ({ ok: true, userId: 'u1', account: { kind: 'session', email: 'jo@example.com', name: 'Jo', isAdmin: false, isPaid, plan: isPaid ? 'paid' : 'free', billing: { available: false } } });
const days = n => Array.from({ length: n }, (_, i) => { const date = `2026-08-${String(30 - i).padStart(2, '0')}`; return { date, savedAt: `${date}T15:00:00.000Z`, entries: 3, score: 5 }; });

async function open(page, paid) {
  await page.addInitScript(() => {
    localStorage.setItem('ironlog:hidetip', '1');
    localStorage.setItem('ironlog:hidelocal', '1');
    localStorage.setItem('ironlog:flag:apiSync', 'true');
    localStorage.setItem('ironlog:session/known', 'true');
  });
  await page.clock.install({ time: new Date('2026-09-24T18:30:00-04:00') });
  await page.route('**/api/**', json({ ok: false }, 401));
  await page.route('**/api/sync*', json({ rows: [], cursor: '0', more: false }));
  await page.route('**/api/me', json(me(paid)));
  await page.route('**/api/backups', json({ ok: true, days: 30, backups: paid ? days(30) : [] }));
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.locator('#account-badge').click();
  return page.getByRole('group', { name: 'Backups' });
}

test('a paid account sees the newest 10 copies and can open the rest', async ({ page }) => {
  const box = await open(page, true);
  await expect(box.locator('.exrow')).toHaveCount(10);
  const more = box.getByRole('button', { name: 'Show all 30 copies' });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await more.click();
  await expect(box.locator('.exrow')).toHaveCount(30);
  await expect(box.getByRole('button', { name: 'Show fewer copies' })).toHaveAttribute('aria-expanded', 'true');
});

test('a free account sees one panel with this-device copies only', async ({ page }) => {
  const box = await open(page, false);
  await expect(page.getByRole('heading', { level: 3, name: 'Backups & data' })).toHaveCount(1);
  await expect(box).not.toContainText('Your account');
  await expect(page.getByRole('button', { name: 'Export all data', exact: true })).toBeVisible();
  await expect(page.getByText('Import from file')).toBeVisible();
});
