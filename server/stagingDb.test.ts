import { execFile } from 'node:child_process';
import { connect, createServer, type AddressInfo, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { sql, type Kysely } from 'kysely';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DB } from './db/types.ts';
import { startTestDatabase } from './test/postgres.ts';

// scripts/staging-db.mjs against a real Postgres with the real migrations (ADRs 055 and 056): the cleaning after staging is copied from
// production, and the mark the staging deploy checks before it migrates anything.
// PROD_DATABASE_URL names some other database: `clear` must know which one is production to refuse it. `env` overrides it per test.
const OTHER_PRODUCTION = 'postgres://owner:pw@ep-prod-1.example.com/neondb';
const runWith = (env: Record<string, string>, cwd?: string) => (url: string, ...args: string[]) =>
  new Promise<{ status: number; stdout: string; stderr: string }>(done => {
    execFile('node', [resolve('scripts/staging-db.mjs'), ...args], { cwd, env: { ...process.env, PROD_DATABASE_URL: OTHER_PRODUCTION, STAGING_DATABASE_URL: url, ...env }, encoding: 'utf8' }, (err, stdout, stderr) =>
      done({ status: err ? Number((err as { code?: number }).code ?? 1) : 0, stdout, stderr }));
  });
const run = runWith({});

let db: Kysely<DB>;
let url: string;
let stop: () => Promise<void>;
const count = async (table: string) => Number((await sql<{ n: string }>`select count(*) as n from ${sql.raw(table)}`.execute(db)).rows[0]!.n);

beforeAll(async () => {
  ({ db, url, stop } = await startTestDatabase());
  // What a copy of production carries: a user with a session, a Google token, a one-time code and a push subscription.
  await sql`insert into auth."user" ("id","name","email","emailVerified") values ('u1','n','e@x.co',true)`.execute(db);
  await sql`insert into auth."session" ("id","expiresAt","token","updatedAt","userId") values ('s1', now() + interval '1 day', 'tok', now(), 'u1')`.execute(db);
  await sql`insert into auth."account" ("id","accountId","providerId","userId","accessToken","refreshToken","idToken","password","updatedAt") values ('a1','g1','google','u1','at','rt','it','pw', now())`.execute(db);
  await sql`insert into auth."verification" ("id","identifier","value","expiresAt") values ('v1','e@x.co','123456', now() + interval '1 day')`.execute(db);
  const user = await sql<{ id: string }>`insert into users (auth_user_id) values ('u1') returning id`.execute(db);
  await sql`insert into push_subscription (user_id, endpoint, p256dh, auth) values (${user.rows[0]!.id}, 'https://push.example/1', 'k', 'a')`.execute(db);
}, 120_000);
afterAll(async () => { await stop(); });

describe('staging-db.mjs', () => {
  it('check refuses a database that is not marked as staging', async () => {
    const out = await run(url, 'check');
    expect(out.status).toBe(1);
    expect(out.stderr).toContain('not marked as staging');
  });

  it('clear without --host stops, and with the wrong host changes nothing', async () => {
    expect((await run(url, 'clear', '--apply')).status).toBe(2);
    const wrong = await run(url, 'clear', '--host', 'ep-production.example.com', '--apply');
    expect(wrong.status).toBe(2);
    expect(wrong.stderr).toContain('does not match');
    expect(await count('auth."session"')).toBe(1);
  });

  it('a dry run lists what it would clear and changes nothing', async () => {
    const host = new URL(url).hostname;
    const out = await run(url, 'clear', '--host', host);
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('would clear: 1 sessions');
    expect(out.stdout).toContain('would clear: 1 push subscriptions');
    expect(out.stdout).toContain('Dry run');
    expect(await count('auth."session"')).toBe(1);
    expect(await count('push_subscription')).toBe(1);
    expect((await run(url, 'check')).status).toBe(1);
  });

  it('--apply clears sessions, codes, push subscriptions and stored tokens, keeps the account rows, and marks the database', async () => {
    const out = await run(url, 'clear', '--host', new URL(url).hostname, '--apply');
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('marked as staging');
    expect(await count('auth."session"')).toBe(0);
    expect(await count('auth."verification"')).toBe(0);
    expect(await count('push_subscription')).toBe(0);
    const account = (await sql<Record<string, string | null>>`select "accessToken","refreshToken","idToken","password" from auth."account"`.execute(db)).rows;
    expect(account).toEqual([{ accessToken: null, refreshToken: null, idToken: null, password: null }]);
    expect(await count('auth."user"')).toBe(1);
    expect((await run(url, 'check')).status).toBe(0);
  });

  it('--apply makes the staging login a member of ironlog_app with the given password, so it has the app\'s access and nothing more', async () => {
    const host = new URL(url).hostname;
    const dry = await run(url, 'clear', '--host', host);
    expect(dry.stdout).toContain('would set up: login ironlog_staging');
    const out = await runWith({ STAGING_APP_PASSWORD: "p'w d" })(url, 'clear', '--host', host, '--apply');
    expect(out.status).toBe(0);
    expect(out.stdout + out.stderr).not.toContain("p'w d");
    const login = new URL(url);
    login.username = 'ironlog_staging';
    login.password = encodeURIComponent("p'w d");
    const client = new pg.Client({ connectionString: login.href });
    await client.connect();
    try {
      // The app role's grants arrive through membership; row-level security still applies (no app.user_id, so no rows).
      expect((await client.query('select count(*)::int as n from auth."user"')).rows[0].n).toBe(1);
      expect((await client.query('select count(*)::int as n from push_subscription')).rows[0].n).toBe(0);
      await expect(client.query('delete from auth."user"')).resolves.toBeDefined();
      await expect(client.query('create table nope (x int)')).rejects.toThrow();
    } finally {
      await client.end();
    }
    // Run again: nothing to make, nothing breaks.
    expect((await runWith({ STAGING_APP_PASSWORD: "p'w d" })(url, 'clear', '--host', host, '--apply')).status).toBe(0);
  });

  it('clear refuses production\'s own address (also its pooled form), and refuses when it cannot tell which one is production', async () => {
    const host = new URL(url).hostname;
    const asProd = (h: string) => `postgres://owner:pw@${h}/neondb`;
    const same = await runWith({ PROD_DATABASE_URL: asProd(host) })(url, 'clear', '--host', host, '--apply');
    expect(same.status).toBe(2);
    expect(same.stderr).toContain("production's database");
    const pooled = new URL(url);
    pooled.hostname = 'ep-cool-123-pooler.us-east-2.aws.neon.tech';
    const viaPooler = await runWith({ PROD_DATABASE_URL: asProd('ep-cool-123.us-east-2.aws.neon.tech') })(pooled.href, 'clear', '--host', pooled.hostname);
    expect(viaPooler.status).toBe(2);
    expect(viaPooler.stderr).toContain("production's database");
    // An empty folder: no .env there to name production either (a developer's own checkout has one).
    const unknown = await runWith({ PROD_DATABASE_URL: '' }, tmpdir())(url, 'clear', '--host', host, '--apply');
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toContain('Cannot tell which database is production');
    expect(await count('auth."session"')).toBe(0);
  });

  it('a failed query after the connect exits 2 ("cannot read"), not 1 ("not marked")', async () => {
    // A role belongs to the whole cluster, so one left behind by an interrupted run would break every later run: clear it first.
    await sql`drop role if exists probe_reader`.execute(db);
    await sql`create role probe_reader login password 'probe'`.execute(db);
    await sql`revoke execute on function shobj_description(oid, name) from public`.execute(db);
    try {
      const login = new URL(url);
      login.username = 'probe_reader';
      login.password = 'probe';
      const out = await run(login.href, 'check');
      expect(out.status).toBe(2);
      expect(out.stderr).toContain('Cannot read the database');
    } finally {
      await sql`grant execute on function shobj_description(oid, name) to public`.execute(db);
      await sql`drop role probe_reader`.execute(db);
    }
  });

  it('a connection that is cut in the middle of the run exits 2 too, not with an uncaught error', async () => {
    const real = new URL(url);
    // The script talks to the database through a stand-in whose sockets the test can cut without a word, as a restarting compute or a
    // dropped network does (no error message from the server, so the client sees only an unexpected end).
    const sockets: Socket[] = [];
    const proxy = createServer(client => {
      const upstream = connect(Number(real.port), real.hostname);
      sockets.push(client, upstream);
      client.pipe(upstream).pipe(client);
      client.on('error', () => upstream.destroy());
      upstream.on('error', () => client.destroy());
    });
    await new Promise<void>(done => proxy.listen(0, '127.0.0.1', done));
    // Hold a lock so the script's first query waits on the server; that is the moment to cut the connection.
    const holder = new pg.Client({ connectionString: url });
    await holder.connect();
    await holder.query('begin');
    await holder.query('lock table auth."session" in access exclusive mode');
    try {
      const viaProxy = new URL(url);
      viaProxy.hostname = '127.0.0.1';
      viaProxy.port = String((proxy.address() as AddressInfo).port);
      const done = run(viaProxy.href, 'clear', '--host', '127.0.0.1');
      let waiting = false;
      for (let i = 0; i < 100 && !waiting; i++) {
        waiting = Number((await sql<{ n: string }>`select count(*) as n from pg_stat_activity where wait_event_type = 'Lock' and query ilike '%auth."session"%' and pid <> pg_backend_pid()`.execute(db)).rows[0]!.n) > 0;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 100));
      }
      expect(waiting).toBe(true);
      for (const socket of sockets) socket.destroy();
      const out = await done;
      expect(out.status).toBe(2);
      expect(out.stderr).toContain('Cannot read the database');
    } finally {
      await holder.query('rollback').catch(() => {});
      await holder.end().catch(() => {});
      proxy.close();
    }
  });

  it('never prints the connection string', async () => {
    const out = await run(url, 'clear', '--host', new URL(url).hostname);
    expect(out.stdout + out.stderr).not.toContain(new URL(url).password);
  });

  it('cannot tell without a URL or with an unreachable one', async () => {
    expect((await run('', 'check')).status).toBe(2);
    expect((await runWith({ STAGING_DB_CONNECT_ATTEMPTS: '1' })('postgres://u:p@127.0.0.1:1/x', 'check')).status).toBe(2);
  });

  // Neon un-archives a branch on its first connection, which can be slow, so a failed connect is tried again (and a refusal from the
  // server itself is not).
  describe('connecting to a branch that is slow to wake', () => {
    const quick = { STAGING_DB_CONNECT_ATTEMPTS: '5', STAGING_DB_CONNECT_PAUSE_MS: '300' };

    it('tries again and gets through once the database answers', async () => {
      const real = new URL(url);
      // A stand-in for the database that drops the first two connections (as a branch still waking does), then passes everything through.
      // Counted, not timed, so a slow machine cannot change the outcome; it owns its port from the start, so nothing else can take it.
      let dropped = 0;
      const proxy = createServer(client => {
        if (dropped < 2) { dropped++; client.destroy(); return; }
        const upstream = connect(Number(real.port), real.hostname);
        client.pipe(upstream).pipe(client);
        client.on('error', () => upstream.destroy());
        upstream.on('error', () => client.destroy());
      });
      await new Promise<void>(done => proxy.listen(0, '127.0.0.1', done));
      const port = (proxy.address() as AddressInfo).port;
      try {
        const viaProxy = new URL(url);
        viaProxy.hostname = '127.0.0.1';
        viaProxy.port = String(port);
        const out = await runWith(quick)(viaProxy.href, 'check');
        expect(out.stderr).toContain('Could not connect (attempt 1 of 5)');
        expect(out.stderr).toContain('archive');
        expect(out.stdout).toContain('marked as staging');
        expect(out.status).toBe(0);
      } finally {
        proxy.close();
      }
    });

    it('gives up after the attempts, saying which one it was on', async () => {
      const out = await runWith({ STAGING_DB_CONNECT_ATTEMPTS: '2', STAGING_DB_CONNECT_PAUSE_MS: '100' })('postgres://u:p@127.0.0.1:1/x', 'check');
      expect(out.status).toBe(2);
      expect(out.stderr).toContain('Could not connect (attempt 1 of 2)');
      expect(out.stderr).toContain('Cannot connect (attempt 2 of 2)');
    });

    it('does not try again for a host name that does not exist', async ({ skip }) => {
      const out = await runWith({ STAGING_DB_CONNECT_ATTEMPTS: '3', STAGING_DB_CONNECT_PAUSE_MS: '100' })('postgres://u:p@no-such-host.invalid/x', 'check');
      // With no working resolver (offline, a sandbox) the lookup fails with EAI_AGAIN, a temporary failure the script rightly retries:
      // that is not the case under test, so the test is skipped (and shows as skipped) rather than passed.
      if (out.stderr.includes('EAI_AGAIN')) skip();
      expect(out.status).toBe(2);
      expect(out.stderr).toContain('Cannot connect (attempt 1 of 3)');
      expect(out.stderr).not.toContain('Could not connect');
    });

    it('does not try again when the server itself refuses the login', async () => {
      const wrong = new URL(url);
      wrong.password = 'not-the-password';
      const out = await runWith({ STAGING_DB_CONNECT_ATTEMPTS: '3', STAGING_DB_CONNECT_PAUSE_MS: '100' })(wrong.href, 'check');
      expect(out.status).toBe(2);
      expect(out.stderr).toContain('Cannot connect (attempt 1 of 3)');
      expect(out.stderr).not.toContain('Could not connect');
    });
  });
});
