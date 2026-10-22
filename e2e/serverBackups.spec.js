import { test, expect } from '@playwright/test';

// Settings → Automatic backups → "Saved on your account" (ServerBackups.tsx, ADR 066). There is no real API behind `vite preview`, so /api is
// scripted; the real server routes are covered by server/backups.test.ts and e2e-sync/serverBackups.spec.js. The clock is fixed at Sep 24 2026.
const json = (body, status = 200) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const ME = { ok: true, userId: 'u1', account: { kind: 'session', email: 'jo@example.com', name: 'Jo', isAdmin: false, isPaid: false, plan: 'free', billing: { available: false } } };
const FILE = JSON.stringify({ app: 'iron-log', format: 1, exportedAt: '2026-09-23T12:00:00.000Z', logs: { squat: [{ id: 'e1', d: '2026-09-23', w: 225, r: 5 }] } });
const days = (...ds) => ds.map(date => ({ date, savedAt: `${date}T15:00:00.000Z`, entries: 12, score: 20 }));

async function open(page, { list, uploads } = {}) {
  await page.addInitScript(() => {
    localStorage.setItem('ironlog:hidetip', '1');
    localStorage.setItem('ironlog:hidelocal', '1');
    localStorage.setItem('ironlog:flag:apiSync', 'true');
    localStorage.setItem('ironlog:session/known', 'true');
  });
  await page.clock.install({ time: new Date('2026-09-24T18:30:00-04:00') });
  await page.route('**/api/**', json({ ok: false }, 401));
  await page.route('**/api/sync*', json({ rows: [], cursor: '0', more: false }));
  await page.route('**/api/me', json(ME));
  await page.route('**/api/backups', list ?? json({ ok: true, days: 7, backups: [] }));
  await page.route('**/api/backups/2026-09-23', route => route.fulfill({ status: 200, contentType: 'application/json', body: FILE }));
  await page.route('**/api/backups/2026-09-24', route => { uploads?.push({ method: route.request().method(), headers: route.request().headers() }); return json({ ok: true, saved: true })(route); });
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.locator('#account-badge').click();
  return page.getByRole('group', { name: 'Saved on your account' });
}

test('lists the days kept on the account, and Restore opens that day in the import review', async ({ page }) => {
  const box = await open(page, { list: json({ ok: true, days: 7, backups: days('2026-09-24', '2026-09-23') }) });
  await expect(box.locator('.exrow')).toHaveCount(2);
  await expect(box.locator('.exrow b').first()).toHaveText('Today, Sep 24');
  await expect(box).toContainText('last 7 days');
  await box.getByRole('button', { name: 'Restore the account backup from Sep 23' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Account backup of 2026-09-23');
});

test('a paid account reads 30 days', async ({ page }) => {
  const box = await open(page, { list: json({ ok: true, days: 30, backups: days('2026-09-24') }) });
  await expect(box).toContainText('last 30 days');
});

test('with nothing on the account yet it says so', async ({ page }) => {
  const box = await open(page);
  await expect(box.getByRole('status')).toContainText('No account backup yet');
});

test('offline it says the list cannot be reached, offers Try again, and the browser copies still work', async ({ page }) => {
  let offline = true;
  const box = await open(page, { list: route => (offline ? route.abort('internetdisconnected') : json({ ok: true, days: 7, backups: days('2026-09-24') })(route)) });
  await expect(box.getByRole('status')).toContainText('can’t be reached');
  const local = page.getByRole('group', { name: 'Automatic backups' });
  await page.clock.fastForward(11_000);
  await expect(local.locator('.exrow')).toHaveCount(1, { timeout: 15_000 });
  offline = false;
  // The upload after the browser copy also refreshes this list, so it may already be back; otherwise Try again does it.
  const again = box.getByRole('button', { name: 'Try again' });
  await expect(async () => {
    if (await again.isVisible()) await again.click({ timeout: 1000 }).catch(() => {});
    await expect(box.locator('.exrow')).toHaveCount(1, { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
});

test("today's file is uploaded after the browser copy is saved, once, with the counts and gzip", async ({ page }) => {
  const uploads = [];
  await open(page, { uploads });
  await page.clock.fastForward(11_000);
  await expect.poll(() => uploads.length, { timeout: 15_000 }).toBe(1);
  expect(uploads[0].method).toBe('PUT');
  expect(uploads[0].headers['x-backup-encoding']).toBe('gzip');
  expect(uploads[0].headers['content-type']).toBe('application/octet-stream');
  expect(uploads[0].headers['x-backup-entries']).toMatch(/^\d+$/);
  await page.clock.fastForward(40_000); // nothing changed, so nothing more is sent
  expect(uploads).toHaveLength(1);
});
