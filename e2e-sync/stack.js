import { test as base, expect } from '@playwright/test';
import pg from 'pg';

// Helpers for the end-to-end sync tests: a signed-in "phone" (a browser context with the sync flag on and its own dev user),
// and a direct look at what the database holds.
const pool = new pg.Pool({ connectionString: process.env.E2E_DATABASE_URL });
export const closePool = () => pool.end();

// A fixed Thursday (week of Sun Sep 20 2026), as in the ordinary browser tests, so every test starts from the same board.
const NOW = new Date('2026-09-24T18:30:00-04:00');

/** What the server holds for one dev user. */
export const server = {
  async entries(user) {
    const { rows } = await pool.query(
      `select l.exercise_id, l.slot, l.wk::text as wk, l.auto, l.version, l.weight_lb::float as w, l.client_id
         from log_entries l join users u on u.id = l.user_id
        where u.auth_user_id = $1 and l.deleted_at is null order by l.client_id`, [`dev:${user}`]);
    return rows;
  },
  async week(user, weekStart) {
    const { rows } = await pool.query(
      `select w.data, w.version from weeks w join users u on u.id = w.user_id where u.auth_user_id = $1 and w.week_start = $2 and w.deleted_at is null`,
      [`dev:${user}`, weekStart]);
    return rows[0] ?? null;
  },
};

/** A new phone for `user`: its own browser storage, sync on, signed in as that dev user. Call open() to load the app. */
export async function newPhone(browser, user) {
  const context = await browser.newContext({ serviceWorkers: 'block', timezoneId: 'America/New_York', viewport: { width: 1440, height: 900 } });
  await context.addInitScript(u => {
    localStorage.setItem('ironlog:hidetip', '1');
    localStorage.setItem('ironlog:hidelocal', '1');
    localStorage.setItem('ironlog:flag:apiSync', 'true');
    localStorage.setItem('ironlog:flag:apiUser', JSON.stringify(u));
  }, user);
  const page = await context.newPage();
  await page.clock.install({ time: NOW });
  return {
    context, page,
    async open() {
      await page.goto('/');
      await expect(page.locator('#chk-A-d1s1')).toBeVisible({ timeout: 30_000 });
      // The store refuses writes until everything has loaded, which waits for the first pull: wait for that, not just the board.
      await expect(page.locator('.saveflag')).not.toHaveText('Loading…', { timeout: 30_000 });
      return page;
    },
    close: () => context.close(),
  };
}

// Each test gets its own dev user, so tests never see each other's rows and nothing needs cleaning up.
export const test = base.extend({
  // Playwright needs the first argument to be an object pattern, even when no fixtures are used.
  // oxlint-disable-next-line no-empty-pattern
  user: async ({}, provide, testInfo) => { await provide(`e2e-${testInfo.workerIndex}-${testInfo.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20)}-${Date.now() % 100000}`); },
});
export { expect };
