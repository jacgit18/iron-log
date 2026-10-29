import pg from 'pg';
import { expect, newPhone, server, test } from './stack.js';

// Signed in, the badge opens the account menu and a row opens Settings; signed out, Settings keeps its tab.
const goSettings = async page => {
  if (await page.locator('#tab-settings').count()) await page.locator('#tab-settings').click();
  else {
    await page.locator('#account-badge').click();
    await page.getByRole('group', { name: 'Account menu' }).getByRole('button', { name: 'Data' }).click();
  }
};

// Server backup history against the real API and Postgres (ADR 066): the app uploads today's export file once the browser copy is saved,
// the server keeps it under the account, and the Settings list reads it back.
const pool = new pg.Pool({ connectionString: process.env.E2E_DATABASE_URL });
const snapshots = async user => (await pool.query(
  `select to_char(b.day, 'YYYY-MM-DD') as day, b.entries, b.score, b.size_bytes, b.device from backup_snapshots b join users u on u.id = b.user_id where u.auth_user_id = $1 order by b.day`, [`dev:${user}`])).rows;

test('a signed-in phone uploads its daily copy, and Settings lists it from the server', async ({ browser, user }) => {
  await server.seedPrograms(user);
  await pool.query("update users set plan = 'paid' where auth_user_id = $1", [`dev:${user}`]); // account backups are for paid accounts and admins
  const a = await newPhone(browser, user);
  await a.page.clock.setSystemTime(new Date()); // the server accepts only a day near its own today; the other tests run on a fixed September date
  const page = await a.open();
  await page.locator('#chk-A-d1s1').check(); // some data, so the copy is worth keeping
  await page.clock.fastForward(40_000);
  await expect.poll(async () => (await snapshots(user)).length, { timeout: 30_000 }).toBe(1);
  const [row] = await snapshots(user);
  expect(row.size_bytes).toBeGreaterThan(0);
  expect(row.device).toBeTruthy(); // the phone sent its device name with the copy

  await goSettings(page);
  const box = page.getByRole('group', { name: 'Backups' });
  await expect(box.locator('.exrow[data-where=both]')).toHaveCount(1); // today is on this device and on the account: one row
  await box.getByRole('button', { name: /^Restore account copy from/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await a.close();
});
