import pg from 'pg';
import { expect, newPhone, server, test } from './stack.js';

// Server backup history against the real API and Postgres (ADR 066): the app uploads today's export file once the browser copy is saved,
// the server keeps it under the account, and the Settings list reads it back.
const pool = new pg.Pool({ connectionString: process.env.E2E_DATABASE_URL });
const snapshots = async user => (await pool.query(
  `select to_char(b.day, 'YYYY-MM-DD') as day, b.entries, b.score, b.size_bytes from backup_snapshots b join users u on u.id = b.user_id where u.auth_user_id = $1 order by b.day`, [`dev:${user}`])).rows;

test('a signed-in phone uploads its daily copy, and Settings lists it from the server', async ({ browser, user }) => {
  await server.seedPrograms(user);
  const a = await newPhone(browser, user);
  await a.page.clock.setSystemTime(new Date()); // the server accepts only a day near its own today; the other tests run on a fixed September date
  const page = await a.open();
  await page.locator('#chk-A-d1s1').check(); // some data, so the copy is worth keeping
  await page.clock.fastForward(40_000);
  await expect.poll(async () => (await snapshots(user)).length, { timeout: 30_000 }).toBe(1);
  const [row] = await snapshots(user);
  expect(row.size_bytes).toBeGreaterThan(0);

  await page.locator('#account-badge').click();
  const box = page.getByRole('group', { name: 'Saved on your account' });
  await expect(box.locator('.exrow')).toHaveCount(1);
  await box.getByRole('button', { name: /^Restore the account backup from/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await a.close();
});
