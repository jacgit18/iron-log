import { test as base, expect } from '@playwright/test';
import pg from 'pg';
import { BUILTIN } from '../src/lib/data.ts';

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
  async counts(user) {
    const { rows } = await pool.query(
      `select (select count(*) from log_entries l where l.user_id = u.id)::int as entries, (select count(*) from body_entries b where b.user_id = u.id)::int as body,
              (select count(*) from weeks w where w.user_id = u.id)::int as weeks
         from users u where u.auth_user_id = $1`, [`dev:${user}`]);
    return rows[0] ?? { entries: 0, body: 0, weeks: 0 };
  },
  /** Gives a dev user the two programs a returning user has saved. An account with no program and no log entries starts on a blank board
   *  (ADR 016), so tests that tick a card need this first. It makes the account non-empty, which turns the old-data upload off. */
  async seedPrograms(user) {
    const c = await pool.connect();
    try {
      await c.query('begin');
      const { rows: [u] } = await c.query('insert into users (auth_user_id) values ($1) on conflict (auth_user_id) do update set auth_user_id = excluded.auth_user_id returning id', [`dev:${user}`]);
      let seq = 0;
      for (const k of ['A', 'B']) { seq++; await c.query('insert into programs (user_id, seq, key, data) values ($1, $2, $3, $4) on conflict (user_id, key) do nothing', [u.id, seq, k, JSON.stringify(BUILTIN[k])]); }
      await c.query('update users set change_seq = greatest(change_seq, $2) where id = $1', [u.id, seq]);
      await c.query('commit');
    } catch (err) { await c.query('rollback'); throw err; } finally { c.release(); }
  },
  async week(user, weekStart) {
    const { rows } = await pool.query(
      `select w.data, w.version from weeks w join users u on u.id = w.user_id where u.auth_user_id = $1 and w.week_start = $2 and w.deleted_at is null`,
      [`dev:${user}`, weekStart]);
    return rows[0] ?? null;
  },
};

/** A new phone for `user`: its own browser storage, sync on, signed in as that dev user. Call open() to load the app.
 *  `old` is documents the browser held before accounts, by path (logs/squat, ...): they are put in its storage first. */
export async function newPhone(browser, user, old = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block', timezoneId: 'America/New_York', viewport: { width: 1440, height: 900 } });
  await context.addInitScript(u => {
    localStorage.setItem('ironlog:hidetip', '1');
    localStorage.setItem('ironlog:hidelocal', '1');
    localStorage.setItem('ironlog:flag:apiSync', 'true');
    localStorage.setItem('ironlog:flag:apiUser', JSON.stringify(u));
  }, user);
  if (Object.keys(old).length) await context.addInitScript(docs => { for (const [path, doc] of Object.entries(docs)) localStorage.setItem(`ironlog:${path}`, JSON.stringify(doc)); }, old);
  const page = await context.newPage();
  await page.clock.install({ time: NOW });
  return {
    context, page,
    /** `blank`: the account is new, so the board has no cards to wait for. */
    async open({ blank = false } = {}) {
      await page.goto('/');
      if (!blank) await expect(page.locator('#chk-A-d1s1')).toBeVisible({ timeout: 30_000 });
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
