import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createAuth } from '../auth/betterAuth.ts';
import { inUserTransaction } from '../auth.ts';
import { startTestDatabase } from '../test/postgres.ts';
import { createDb } from './connection.ts';
import { checkDbRole, describeDbRole, rlsProblem } from './role.ts';
import type { DB } from './types.ts';

// Row-level security (migration 009, ADR 004): every row is reachable only by its owner, enforced by the database. The owner
// connection (a superuser here, as in local development) sets up data; the app connection is the restricted role the API runs as.
let owner: Kysely<DB>;
let app: Kysely<DB>;
let stop: () => Promise<void>;
let appUrl: string;
let A: string;
let B: string;

const DATA_TABLES = ['log_entries', 'body_entries', 'weeks', 'stretch_weeks', 'supplement_days', 'programs', 'config', 'library_items', 'list_items'] as const;

beforeAll(async () => {
  ({ db: owner, stop, appUrl } = await startTestDatabase());
  app = createDb(appUrl);
}, 120_000);
afterAll(async () => {
  await app.destroy();
  await stop?.();
});

// Two users with one row in every table, written as the owner (which row-level security does not restrict).
beforeEach(async () => {
  await owner.deleteFrom('users').execute();
  const ids: string[] = [];
  for (const name of ['a', 'b']) {
    const id = (await owner.insertInto('users').values({ auth_user_id: `u-${name}` }).returning('id').executeTakeFirstOrThrow()).id;
    ids.push(id);
    await owner.insertInto('log_entries').values({ user_id: id, client_id: `e-${name}`, seq: '1', exercise_id: 'squat', d: '2026-10-05' }).execute();
    await owner.insertInto('body_entries').values({ user_id: id, seq: '1', wk: '2026-10-04', d: '2026-10-07', weight_lb: '180' }).execute();
    await owner.insertInto('weeks').values({ user_id: id, seq: '1', week_start: '2026-10-04', data: '{}' }).execute();
    await owner.insertInto('stretch_weeks').values({ user_id: id, seq: '1', week_start: '2026-10-04', data: '{}' }).execute();
    await owner.insertInto('supplement_days').values({ user_id: id, seq: '1', day: '2026-10-07' }).execute();
    await owner.insertInto('programs').values({ user_id: id, seq: '1', key: 'A', data: '{}' }).execute();
    await owner.insertInto('config').values({ user_id: id, seq: '1', data: '{}' }).execute();
    await owner.insertInto('library_items').values({ user_id: id, client_id: `v-${name}`, seq: '1', data: '{}' }).execute();
    await owner.insertInto('list_items').values({ user_id: id, list: 'stretch', client_id: `s-${name}`, position: 0, seq: '1', data: '{}' }).execute();
    await owner.insertInto('refused_writes').values({ user_id: id, command: 'x', reason: 'y' }).execute();
  }
  [A, B] = ids as [string, string];
});

const asUser = <T>(id: string, fn: Parameters<typeof inUserTransaction<T>>[2]) => inUserTransaction(app, id, fn);
const count = (db: Kysely<DB>, table: string) => sql<{ n: string }>`select count(*) as n from ${sql.table(table)}`.execute(db).then(r => Number(r.rows[0]!.n));
// What a statement says when it is refused.
const refusal = async (p: Promise<unknown>) => { try { await p; return ''; } catch (e) { return e instanceof Error ? e.message : String(e); } };

describe('reading', () => {
  it.each(DATA_TABLES)('%s: a user sees only their own rows', async table => {
    expect(await count(owner, table)).toBe(2);
    expect(await asUser(A, trx => count(trx as never, table))).toBe(1);
    const rows = await asUser(B, trx => sql<{ user_id: string }>`select user_id from ${sql.table(table)}`.execute(trx));
    expect(rows.rows.map(r => r.user_id)).toEqual([B]);
  });

  it('users: a user sees only their own row', async () => {
    expect(await asUser(A, trx => sql<{ id: string }>`select id from users`.execute(trx)).then(r => r.rows.map(x => x.id))).toEqual([A]);
  });

  it.each([...DATA_TABLES, 'users'])('%s: with no user set, nothing is visible', async table => {
    expect(await count(app, table)).toBe(0);
  });

  it('an empty or unreadable user setting shows nothing, and does not fail', async () => {
    const out = await app.transaction().execute(async trx => {
      await sql`select set_config('app.user_id', '', true)`.execute(trx);
      return count(trx as never, 'log_entries');
    });
    expect(out).toBe(0);
  });

  it('the setting does not outlive its transaction on a pooled connection', async () => {
    await asUser(A, trx => count(trx as never, 'log_entries'));
    for (let i = 0; i < 5; i++) expect(await count(app, 'log_entries')).toBe(0); // the same few pooled connections, now with nothing set
  });
});

describe('writing', () => {
  const entry = (user: string, id: string) => sql`insert into log_entries (user_id, client_id, seq, exercise_id, d) values (${user}, ${id}, 2, 'squat', '2026-10-06')`;

  it.each(DATA_TABLES)('%s: a user cannot add a row for someone else', async table => {
    const insert: Record<string, ReturnType<typeof sql>> = {
      log_entries: entry(B, 'sneaky'),
      body_entries: sql`insert into body_entries (user_id, seq, wk, d, weight_lb) values (${B}, 2, '2026-10-11', '2026-10-12', 181)`,
      weeks: sql`insert into weeks (user_id, seq, week_start, data) values (${B}, 2, '2026-10-11', '{}')`,
      stretch_weeks: sql`insert into stretch_weeks (user_id, seq, week_start, data) values (${B}, 2, '2026-10-11', '{}')`,
      supplement_days: sql`insert into supplement_days (user_id, seq, day) values (${B}, 2, '2026-10-08')`,
      programs: sql`insert into programs (user_id, seq, key, data) values (${B}, 2, 'B', '{}')`,
      config: sql`insert into config (user_id, seq, data) values (${B}, 2, '{}')`,
      library_items: sql`insert into library_items (user_id, client_id, seq, data) values (${B}, 'sneaky', 2, '{}')`,
      list_items: sql`insert into list_items (user_id, list, client_id, position, seq, data) values (${B}, 'stretch', 'sneaky', 1, 2, '{}')`,
    };
    expect(await refusal(asUser(A, trx => insert[table]!.execute(trx)))).toMatch(/row-level security|violates|duplicate key/);
    expect(await count(owner, table)).toBe(2);
  });

  it('a user can add and change their own rows', async () => {
    await asUser(A, trx => entry(A, 'mine').execute(trx));
    await asUser(A, trx => sql`update log_entries set weight_lb = 140 where client_id = 'mine'`.execute(trx));
    expect(Number((await owner.selectFrom('log_entries').select('weight_lb').where('client_id', '=', 'mine').executeTakeFirstOrThrow()).weight_lb)).toBe(140);
  });

  it("an update of someone else's row changes nothing", async () => {
    const res = await asUser(A, trx => sql`update log_entries set weight_lb = 999 where client_id = 'e-b'`.execute(trx));
    expect(Number(res.numAffectedRows)).toBe(0);
    expect((await owner.selectFrom('log_entries').select('weight_lb').where('client_id', '=', 'e-b').executeTakeFirstOrThrow()).weight_lb).toBeNull();
  });

  it('a user cannot hand their row to someone else', async () => {
    expect(await refusal(asUser(A, trx => sql`update log_entries set user_id = ${B} where client_id = 'e-a'`.execute(trx)))).toMatch(/row-level security/);
  });

  it.each([...DATA_TABLES, 'users', 'refused_writes'])('%s: nothing can be deleted by the API role (rows are soft-deleted)', async table => {
    expect(await refusal(asUser(A, trx => sql`delete from ${sql.table(table)}`.execute(trx)))).toMatch(/permission denied/);
  });

  it('the history trigger still records the replaced row, although the API role cannot reach the history table', async () => {
    await asUser(A, trx => sql`update log_entries set weight_lb = 140, version = 2 where client_id = 'e-a'`.execute(trx));
    const history = await owner.selectFrom('row_history').select(['table_name', 'version']).execute();
    expect(history).toEqual([{ table_name: 'log_entries', version: 1 }]);
    expect(await refusal(asUser(A, trx => sql`select * from row_history`.execute(trx)))).toMatch(/permission denied/);
  });
});

describe('users', () => {
  it('cannot be added, or promoted, or renamed, by the API role', async () => {
    expect(await refusal(app.insertInto('users').values({ auth_user_id: 'x' }).execute())).toMatch(/permission denied/);
    expect(await refusal(asUser(A, trx => sql`update users set is_admin = true`.execute(trx)))).toMatch(/permission denied/);
    expect(await refusal(asUser(A, trx => sql`update users set auth_user_id = 'someone-else'`.execute(trx)))).toMatch(/permission denied/);
    expect((await owner.selectFrom('users').select('is_admin').where('id', '=', A).executeTakeFirstOrThrow()).is_admin).toBe(false);
  });

  it('can move only its own change counter', async () => {
    await asUser(A, trx => sql`update users set change_seq = change_seq + 1`.execute(trx));
    const seqs = await owner.selectFrom('users').select(['id', 'change_seq']).execute();
    expect(seqs.find(u => u.id === A)!.change_seq).toBe('1');
    expect(seqs.find(u => u.id === B)!.change_seq).toBe('0');
  });

  it('ensure_user makes the row, returns the same id again, and is safe when many ask at once', async () => {
    const ask = () => sql<{ id: string }>`select ensure_user('google-123') as id`.execute(app).then(r => r.rows[0]!.id);
    const ids = await Promise.all(Array.from({ length: 10 }, ask));
    expect(new Set(ids).size).toBe(1);
    expect(await ask()).toBe(ids[0]);
    expect((await owner.selectFrom('users').select('id').where('auth_user_id', '=', 'google-123').execute())).toHaveLength(1);
  });

  it('can be reached only through ensure_user: the function is the one door', async () => {
    const privs = await sql<{ p: boolean }>`select has_function_privilege('ironlog_app', 'ensure_user(text)', 'execute') as p`.execute(owner);
    expect(privs.rows[0]!.p).toBe(true);
    const pub = await sql<{ p: boolean }>`select has_function_privilege('public', 'ensure_user(text)', 'execute') as p`.execute(owner);
    expect(pub.rows[0]!.p).toBe(false);
  });
});

describe('refusals', () => {
  it('can be written for the caller, never read, and never written for someone else', async () => {
    await asUser(A, trx => sql`insert into refused_writes (user_id, command, reason) values (${A}, 'log-session', 'stale')`.execute(trx));
    expect(await refusal(asUser(A, trx => sql`insert into refused_writes (user_id, command, reason) values (${B}, 'x', 'y')`.execute(trx)))).toMatch(/row-level security/);
    expect(await refusal(asUser(A, trx => sql`select * from refused_writes`.execute(trx)))).toMatch(/permission denied/);
  });
});

// A table added in a later migration must be covered. This is what stops one being forgotten.
describe('every table is covered (a forgotten table fails here)', () => {
  it('each table in public has row-level security on, and the API role has no delete, truncate or history access', async () => {
    const tables = (await sql<{ relname: string; rls: boolean }>`
      select c.relname, c.relrowsecurity as rls from pg_class c
       where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname <> 'schema_migrations' order by 1`.execute(owner)).rows;
    expect(tables.map(t => t.relname)).toEqual(expect.arrayContaining([...DATA_TABLES, 'users', 'refused_writes', 'row_history']));
    expect(tables.filter(t => !t.rls).map(t => t.relname), 'tables without row-level security').toEqual([]);
    for (const { relname } of tables) {
      const p = (await sql<{ del: boolean; trunc: boolean; sel: boolean }>`
        select has_table_privilege('ironlog_app', ${`public.${relname}`}, 'delete') as del,
               has_table_privilege('ironlog_app', ${`public.${relname}`}, 'truncate') as trunc,
               has_table_privilege('ironlog_app', ${`public.${relname}`}, 'select') as sel`.execute(owner)).rows[0]!;
      expect(p.del, `${relname}: delete`).toBe(false);
      expect(p.trunc, `${relname}: truncate`).toBe(false);
      if (relname === 'row_history' || relname === 'refused_writes') expect(p.sel, `${relname}: select`).toBe(false);
    }
  });

  it('each table that holds a user\'s rows has a policy for the API role', async () => {
    const policies = (await sql<{ tablename: string }>`select tablename from pg_policies where schemaname = 'public' and 'ironlog_app' = any(roles)`.execute(owner)).rows.map(r => r.tablename);
    const withUser = (await sql<{ table_name: string }>`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'user_id' order by 1`.execute(owner)).rows.map(r => r.table_name);
    const missing = withUser.filter(t => t !== 'row_history' && !policies.includes(t));
    expect(missing, 'tables with a user_id and no policy').toEqual([]);
    expect(policies).toContain('users');
  });
});

describe('knowing which role the API runs as', () => {
  it('the owner (a superuser here) is not protected by row-level security; the API role is', async () => {
    const o = await describeDbRole(owner);
    expect(o.superuser).toBe(true);
    expect(rlsProblem(o)).toMatch(/superuser/);
    const a = await describeDbRole(app);
    expect(a).toMatchObject({ role: 'ironlog_app', superuser: false, bypassRls: false, ownsTables: false });
    expect(rlsProblem(a)).toBeNull();
  });

  it('names a role that bypasses row-level security, or owns the tables', () => {
    expect(rlsProblem({ role: 'x', superuser: false, bypassRls: true, ownsTables: false })).toMatch(/BYPASSRLS/);
    expect(rlsProblem({ role: 'x', superuser: false, bypassRls: false, ownsTables: true })).toMatch(/owns the tables/);
  });

  it('production refuses to run as an unrestricted role, and elsewhere just reports it', async () => {
    await expect(checkDbRole(owner, 'production')).rejects.toThrow(/Refusing to start.*superuser.*ironlog_app/);
    expect(await checkDbRole(owner, 'development')).toMatch(/superuser/);
    expect(await checkDbRole(owner, undefined)).toMatch(/superuser/);
    expect(await checkDbRole(app, 'production')).toBeNull();
  });

  it('retries a database that is not up yet, then gives up: an error in production, a report elsewhere', async () => {
    const down = createDb('postgres://ironlog_app:x@127.0.0.1:1/none');
    try {
      await expect(checkDbRole(down, 'production', 2, 1)).rejects.toThrow(/could not check which database role/);
      expect(await checkDbRole(down, 'development', 2, 1)).toMatch(/could not check which database role/);
    } finally {
      await down.destroy();
    }
  });
});

describe('the whole API as the restricted role', () => {
  let server: Server;
  let base: string;
  let auth: ReturnType<typeof createAuth>;
  const SECRET = randomBytes(32).toString('base64');

  beforeAll(async () => {
    auth = createAuth({ baseURL: 'http://localhost:3999', secret: SECRET, databaseUrl: appUrl, google: { clientId: 'c', clientSecret: 's' }, testSignIn: true }, 'test');
    server = createApp({ db: app, auth }).listen(0);
    await new Promise(done => server.once('listening', done));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>(done => server.close(() => done()));
    await auth.pool.end();
  });

  const signUp = async (email: string) => {
    const res = await fetch(`${base}/api/auth/sign-up/email`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'correct horse battery staple', name: 'T' }) });
    expect(res.status, 'Better Auth can use its tables as the API role').toBe(200);
    return (res.headers.getSetCookie().find(c => /session_token=/.test(c)) ?? '').split(';')[0]!;
  };
  const post = (path: string, cookie: string, body: unknown) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });
  const pull = async (cookie: string) => ((await (await fetch(`${base}/api/sync?since=0`, { headers: { cookie } })).json()) as { rows: { client_id?: string }[] }).rows;

  it('signs in, makes the user, and runs commands, the pull and the history trigger, with every user kept apart', async () => {
    await owner.deleteFrom('users').execute();
    await sql`delete from auth."user"`.execute(owner);
    const ann = await signUp('ann@example.com');
    const bob = await signUp('bob@example.com');
    const entry = (id: string, w: number) => ({ clientId: id, baseVersion: null, input: { exerciseId: 'squat', entry: { d: '2026-10-05', w } } });
    expect((await post('/api/commands/log-session', ann, entry('ann-1', 100))).status).toBe(201);
    expect((await post('/api/commands/log-session', bob, entry('bob-1', 200))).status).toBe(201);
    // an edit makes a version 2, which needs the history trigger to run as the API role
    expect((await post('/api/commands/log-session', ann, { clientId: 'ann-1', baseVersion: 1, input: { exerciseId: 'squat', entry: { d: '2026-10-05', w: 110 } } })).status).toBe(200);
    expect((await pull(ann)).map(r => r.client_id)).toEqual(['ann-1']);
    expect((await pull(bob)).map(r => r.client_id)).toEqual(['bob-1']);
    expect((await owner.selectFrom('row_history').select('version').execute()).map(h => h.version)).toEqual([1]);
    // a refused write is recorded for the caller
    expect((await post('/api/commands/log-session', bob, { clientId: 'x', baseVersion: null, input: { exerciseId: 'squat', entry: { d: 'nope' } } })).status).toBe(422);
    expect(await owner.selectFrom('refused_writes').select('user_id').where('command', '=', 'log-session').execute()).toHaveLength(1);
    expect(await owner.selectFrom('users').select('auth_user_id').execute()).toHaveLength(2);
  });
});
