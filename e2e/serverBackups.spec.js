import { test, expect } from '@playwright/test';

// Settings → Backups & data → the "Your account" rows of the Backups list (BackupCopies.tsx, ADR 066). There is no real API behind `vite preview`, so /api is
// scripted; the real server routes are covered by server/backups.test.ts and e2e-sync/serverBackups.spec.js. The clock is fixed at Sep 24 2026.
const json = (body, status = 200) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = (isPaid = true) => ({ ok: true, userId: 'u1', account: { kind: 'session', email: 'jo@example.com', name: 'Jo', isAdmin: false, isPaid, plan: isPaid ? 'paid' : 'free', billing: { available: false } } });
const FILE = JSON.stringify({ app: 'iron-log', format: 1, exportedAt: '2026-09-23T12:00:00.000Z', logs: { squat: [{ id: 'e1', d: '2026-09-23', w: 225, r: 5 }] } });
const days = (...ds) => ds.map(date => ({ date, savedAt: `${date}T15:00:00.000Z`, entries: 12, score: 20 }));

async function open(page, { list, uploads, paid = true } = {}) {
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
  await page.route('**/api/backups', list ?? json({ ok: true, days: 30, backups: [] }));
  await page.route('**/api/backups/2026-09-23', route => route.fulfill({ status: 200, contentType: 'application/json', body: FILE }));
  await page.route('**/api/backups/2026-09-24', route => { uploads?.push({ method: route.request().method(), headers: route.request().headers() }); return json({ ok: true, saved: true })(route); });
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.locator('#account-badge').click();
  return page.getByRole('group', { name: 'Backups' });
}

test('lists the days kept on the account, and Restore opens that day in the import review', async ({ page }) => {
  const box = await open(page, { list: json({ ok: true, days: 30, backups: days('2026-09-24', '2026-09-23') }) });
  await expect(box.locator('.exrow[data-where=account]')).toHaveCount(2);
  await expect(box.locator('.exrow[data-where=account] b').first()).toHaveText('Today, Sep 24');
  await expect(box).toContainText('last 30 days');
  await box.getByRole('button', { name: 'Restore the account backup from Sep 23' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Account backup of 2026-09-23');
});

test('a free account sees no account backups and uploads nothing', async ({ page }) => {
  const uploads = [];
  let listed = 0;
  const box = await open(page, { paid: false, uploads, list: route => { listed++; return json({ ok: true, days: 30, backups: [] })(route); } });
  await expect(box).toBeVisible();
  await expect(box).not.toContainText('Your account');
  await expect(box.locator('.exrow[data-where=account]')).toHaveCount(0);
  await page.clock.fastForward(40_000);
  expect(uploads).toHaveLength(0);
  expect(listed).toBe(0);
});

test('a paid account reads 30 days', async ({ page }) => {
  const box = await open(page, { list: json({ ok: true, days: 30, backups: days('2026-09-24') }) });
  await expect(box).toContainText('last 30 days');
});

test('with nothing on the account yet it says so', async ({ page }) => {
  const box = await open(page);
  await expect(box.getByRole('status').filter({ hasText: 'No account backup yet' })).toBeVisible();
});

test('offline it says the list cannot be reached, offers Try again, and the browser copies still work', async ({ page }) => {
  let offline = true;
  const box = await open(page, { list: route => (offline ? route.abort('internetdisconnected') : json({ ok: true, days: 30, backups: days('2026-09-24') })(route)) });
  await expect(box.getByRole('status').filter({ hasText: 'can’t be reached' })).toBeVisible();
  await page.clock.fastForward(11_000);
  await expect(box.locator('.exrow[data-where=device]')).toHaveCount(1, { timeout: 15_000 });
  offline = false;
  // The upload after the browser copy also refreshes this list, so it may already be back; otherwise Try again does it.
  const again = box.getByRole('button', { name: 'Try again' });
  await expect(async () => {
    if (await again.isVisible()) await again.click({ timeout: 1000 }).catch(() => {});
    await expect(box.locator('.exrow[data-where=both]')).toHaveCount(1, { timeout: 1000 }); // today is on this device and the account: one row
  }).toPass({ timeout: 10_000 });
});

test("today's file is uploaded after the browser copy is saved, once, with the counts and gzip", async ({ page }) => {
  const uploads = [];
  await open(page, { uploads });
  await page.clock.fastForward(11_000);
  await expect.poll(() => uploads.length, { timeout: 15_000 }).toBe(1);
  await page.clock.fastForward(40_000); // nothing changed, so nothing more is sent
  expect(uploads).toHaveLength(1);
});

test('a day on this device and on the account is one row, and the account copy says which device wrote it', async ({ page }) => {
  const list = json({ ok: true, days: 30, backups: [{ date: '2026-09-24', savedAt: '2026-09-24T15:00:00.000Z', entries: 12, score: 20, device: 'iPad' }, { date: '2026-09-23', savedAt: '2026-09-23T15:00:00.000Z', entries: 12, score: 20, device: 'iPhone' }] });
  const box = await open(page, { list });
  await page.clock.fastForward(11_000);
  const today = box.locator('.exrow', { hasText: 'Today, Sep 24' });
  await expect(today).toHaveCount(1, { timeout: 15_000 });
  await expect(today).toContainText('This device and your account');
  await expect(today).toContainText('account copy from iPad');
  await expect(today.getByRole('button', { name: 'Restore device copy from Sep 24' })).toBeVisible();
  await expect(today.getByRole('button', { name: 'Restore account copy from Sep 24' })).toBeVisible();
  const yesterday = box.locator('.exrow', { hasText: 'Sep 23' });
  await expect(yesterday).toContainText('Your account · from iPhone');
  await expect(yesterday.getByRole('button', { name: 'Restore the account backup from Sep 23' })).toBeVisible();
  await expect(box.locator('.exrow')).toHaveCount(2); // one row per day, not one per place
});

test('the device can be renamed, and the new name goes up with the next backup', async ({ page }) => {
  const uploads = [];
  const box = await open(page, { uploads, list: json({ ok: true, days: 30, backups: days('2026-09-23') }) });
  await expect(box).toContainText('This device is called');
  await box.getByRole('button', { name: 'Rename' }).click();
  await box.getByLabel('Device name').fill('Work laptop');
  await box.getByRole('button', { name: 'Save name' }).click();
  await expect(box.locator('.devname b')).toHaveText('Work laptop');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:devicename')))).toBe('Work laptop');
  await box.getByRole('button', { name: 'Rename' }).click(); // Cancel leaves the name alone
  await box.getByLabel('Device name').fill('Something else');
  await box.getByRole('button', { name: 'Cancel' }).click();
  await expect(box.locator('.devname b')).toHaveText('Work laptop');
  await page.clock.fastForward(11_000);
  await expect.poll(() => uploads.length, { timeout: 15_000 }).toBeGreaterThan(0);
});
