import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest';
import pg from 'pg';
import { startTestDatabase } from '../test/postgres.ts';
import { TEMPLATE } from '../test/globalSetup.ts';

// Database hardening (brief db-hardening, migration 20261025000001). Three things a future migration could quietly undo, each pinned here:
//  1. every security-definer function puts pg_temp last in its search_path, so a temp table or function cannot stand in for a name it uses;
//  2. PUBLIC may not create temporary tables in the database;
//  3. erase_my_data takes the user's row first, as every sync command does, so a write in flight when an erase starts cannot survive it.
let url: string;
let stop: () => Promise<void>;
let owner: pg.Client;

beforeAll(async () => {
  ({ url, stop } = await startTestDatabase());
  owner = new pg.Client({ connectionString: url });
  await owner.connect();
}, 120_000);
afterAll(async () => {
  await owner?.end();
  await stop?.();
});

describe('security-definer functions', () => {
  it('all have search_path = public, pg_temp, in the public and auth schemas (a new function must say so too)', async () => {
    const { rows } = await owner.query<{ fn: string; cfg: string[] | null }>(
      `select p.oid::regprocedure::text as fn, p.proconfig as cfg from pg_proc p where p.pronamespace in ('public'::regnamespace, 'auth'::regnamespace) and p.prosecdef order by 1`);
    expect(rows.length).toBeGreaterThan(10); // the query reads the functions
    const wrong = rows.filter(r => !(r.cfg ?? []).includes('search_path=public, pg_temp')).map(r => r.fn);
    expect(wrong, `add "set search_path = public, pg_temp" to: ${wrong.join(', ')}`).toEqual([]);
  });
});

describe('temporary tables', () => {
  it('PUBLIC cannot create them in the migrated database', async () => {
    // A test database is cloned from the migrated template and a clone gets the default privileges, so ask about the database the
    // migrations ran in: the template under the shared setup, the database itself when a file runs on its own container.
    const name = inject('pgBase') ? TEMPLATE : (await owner.query<{ n: string }>('select current_database() as n')).rows[0]!.n;
    const { rows } = await owner.query<{ t: boolean }>(`select has_database_privilege('public', $1, 'TEMPORARY') as t`, [name]);
    expect(rows[0]!.t).toBe(false);
    // The role the API runs as, which is what matters: a member of PUBLIC only, and not the owner (the owner keeps the right).
    const app = await owner.query<{ t: boolean }>(`select has_database_privilege('ironlog_app', $1, 'TEMPORARY') as t`, [name]);
    expect(app.rows[0]!.t).toBe(false);
  });
});

describe('erase_my_data and a write in flight', () => {
  // A sync command locks the user's row first (server/commands/support.ts) and writes inside the same transaction. Here one such write is
  // open (not yet committed) when the erase starts. The erase must wait for it, then delete what it wrote: the row cannot survive.
  it('waits for the write, then removes the row it made', async () => {
    const uid = String((await owner.query<{ id: string }>(`insert into users (auth_user_id) values ('u-hardening') returning id`)).rows[0]!.id);
    const writer = new pg.Client({ connectionString: url });
    const eraser = new pg.Client({ connectionString: url });
    await writer.connect();
    await eraser.connect();
    try {
      await writer.query('begin');
      await writer.query(`select set_config('app.user_id', $1, true)`, [uid]);
      await writer.query('select 1 from users where id = $1 for update', [uid]); // what every command does first
      await writer.query(`insert into log_entries (user_id, client_id, seq, exercise_id, d) values ($1, 'in-flight', '1', 'squat', '2026-10-05')`, [uid]);

      await eraser.query('begin');
      await eraser.query(`select set_config('app.user_id', $1, true)`, [uid]);
      const eraserPid = (await eraser.query<{ p: number }>('select pg_backend_pid() as p')).rows[0]!.p; // asked before the erase: a query on this client queues behind it
      const erased = eraser.query('select erase_my_data()'); // starts now, while the write is still open

      // Wait until the erase is blocked on a lock (on the user's row: its first statement with the fix, its last without it).
      let blocked = false;
      for (let i = 0; i < 100 && !blocked; i++) {
        blocked = ((await owner.query(`select 1 from pg_stat_activity where pid = $1 and wait_event_type = 'Lock'`, [eraserPid])).rowCount ?? 0) > 0;
        if (!blocked) await new Promise(r => setTimeout(r, 50));
      }
      expect(blocked, 'the erase should be waiting on the write').toBe(true);
      await writer.query('commit'); // the write lands; the erase may go on
      await erased;
      await eraser.query('commit');

      const left = await owner.query('select count(*)::int as n from log_entries where user_id = $1', [uid]);
      expect(left.rows[0]!.n).toBe(0);
    } finally {
      await writer.query('rollback').catch(() => undefined);
      await eraser.query('rollback').catch(() => undefined);
      await writer.end();
      await eraser.end();
    }
  }, 30_000);
});
