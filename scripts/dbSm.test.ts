import { describe, expect, it } from 'vitest';
import { contained, main, markOf } from './db-sm.mjs';
import { notLocalProblem } from './lib/db-script.mjs';
import { ENVS, REFUSED, check, childEnv, parseArgs, redact } from './lib/db-sm.mjs';
import { inventoryNames } from './secret-inventory.mjs';

// scripts/db-sm.mjs reads an environment's owner URL from Secret Manager and runs a command with it. Every outside call is injected here, so no gcloud, secret or database is touched.
const PASSWORD = 'fake-pw-Zq81x7';
const HOSTS = { qa: 'ep-qa-1.c-6.example.invalid', staging: 'ep-stg-1.c-6.example.invalid', production: 'ep-prod-1.c-6.example.invalid' } as const;
type Env = keyof typeof HOSTS;
const urlFor = (host: string) => `postgres://owner:${PASSWORD}@${host}/db?sslmode=require`;
const hostOf = (u: string) => new URL(u).hostname.toLowerCase();
const same = async (a: string, b: string) => a.replace('-pooler', '') === b.replace('-pooler', '');

function fakes(env: Env, over: { url?: string; mark?: string | null; prod?: string | null } = {}) {
  const url = over.url ?? urlFor(HOSTS[env]);
  const reads: string[] = [];
  const spawned: { file: string; args: string[]; env: Record<string, string | undefined> }[] = [];
  const logs: string[] = [];
  const marks: Record<Env, string | null> = { qa: 'iron-log qa', staging: 'iron-log staging', production: null };
  const deps = {
    host: hostOf,
    notLocal: notLocalProblem,
    prodUrl: () => (over.prod === undefined ? urlFor(HOSTS.production) : over.prod),
    same,
    mark: async () => (over.mark === undefined ? marks[env] : over.mark),
  };
  const spawn = (file: string, args: string[], o: { env: Record<string, string | undefined> }) => { spawned.push({ file, args, env: o.env }); return { status: 0 }; };
  const run = (argv: string[], base: Record<string, string | undefined> = {}) =>
    main(argv, { read: (n: string) => { reads.push(n); return url; }, deps, spawn, log: (m: string) => logs.push(m), base });
  return { run, reads, spawned, logs, url };
}
const argv = (env: string, host: string) => [env, '--host', host, '--', 'node', '-e', '0'];

describe('parseArgs', () => {
  it('takes the environment, the host and the command after --', () => {
    expect(parseArgs(['staging', '--host', 'h', '--', 'npm', 'run', 'x', '--', '--load=f'])).toEqual({ env: 'staging', host: 'h', command: ['npm', 'run', 'x', '--', '--load=f'] });
  });
  it('refuses an unknown environment, a missing host, a missing command and stray arguments', () => {
    expect(() => parseArgs(['prod', '--host', 'h', '--', 'x'])).toThrow(/Unknown environment/);
    expect(() => parseArgs(['qa', '--', 'x'])).toThrow(/--host/);
    expect(() => parseArgs(['qa', '--host', '--', 'x'])).toThrow(/--host/);
    expect(() => parseArgs(['qa', '--host', 'h'])).toThrow(/No command/);
    expect(() => parseArgs(['qa', '--host', 'h', 'extra', '--', 'x'])).toThrow(/Unexpected argument/);
  });
});

describe('secret names', () => {
  for (const [env, name] of [['qa', 'iron-log-qa-owner-database-url'], ['staging', 'iron-log-staging-owner-database-url'], ['production', 'iron-log-prod-owner-url']] as const) {
    it(`${env} reads ${name}`, async () => {
      const f = fakes(env);
      expect(await f.run(argv(env, HOSTS[env]))).toBe(0);
      expect(f.reads).toEqual([name]);
      expect(ENVS[env].secret).toBe(name);
    });
  }
});

describe('the registry', () => {
  it('lists every secret the wrapper reads in the secret inventory', () => {
    const names = inventoryNames();
    for (const e of Object.values(ENVS)) expect(names.has(e.secret)).toBe(true);
  });
});

describe('guards (each refuses before the command runs)', () => {
  const refused = async (env: Env, a: string[], over = {}) => {
    const f = fakes(env, over);
    expect(await f.run(a)).toBe(REFUSED);
    expect(f.spawned).toHaveLength(0);
    return f.logs.join('\n');
  };
  it('--host that differs from the secret\'s host', async () => { expect(await refused('staging', argv('staging', 'other.example.invalid'))).toContain('does not match'); });
  it('a localhost URL', async () => { expect(await refused('qa', argv('qa', 'localhost'), { url: urlFor('localhost') })).toContain('on this machine'); });
  it('a host= parameter that sends the connection elsewhere', async () => {
    const u = `postgres://owner:${PASSWORD}@${HOSTS.qa}/db?host=/var/run/postgresql`;
    expect(await refused('qa', argv('qa', HOSTS.qa), { url: u })).toContain('host= or hostaddr= parameter');
  });
  it('the wrapper\'s refusal code is not 2, so a child\'s exit 2 is told apart', () => { expect(REFUSED).toBe(64); });
  it('production\'s host for qa and for staging', async () => {
    for (const env of ['qa', 'staging'] as const) expect(await refused(env, argv(env, HOSTS.production), { url: urlFor(HOSTS.production) })).toContain('is production\'s database');
  });
  it('a pooled alias of production\'s host for staging', async () => {
    expect(await refused('staging', argv('staging', 'ep-prod-1-pooler.c-6.example.invalid'), { url: urlFor('ep-prod-1-pooler.c-6.example.invalid') })).toContain('production\'s database');
  });
  it('a non-production host for production', async () => { expect(await refused('production', argv('production', HOSTS.qa), { url: urlFor(HOSTS.qa) })).toContain('is not production\'s database'); });
  it('a pooled production URL', async () => {
    const pooled = 'ep-prod-1-pooler.c-6.example.invalid';
    expect(await refused('production', argv('production', pooled), { url: urlFor(pooled) })).toContain('pooled address');
  });
  it('a missing or wrong mark: qa, staging', async () => {
    expect(await refused('qa', argv('qa', HOSTS.qa), { mark: null })).toContain('does not carry the qa mark');
    expect(await refused('qa', argv('qa', HOSTS.qa), { mark: 'iron-log staging' })).toContain('does not carry the qa mark');
    expect(await refused('staging', argv('staging', HOSTS.staging), { mark: 'iron-log qa' })).toContain('does not carry the staging mark');
  });
  it('production carrying the QA or staging mark', async () => {
    expect(await refused('production', argv('production', HOSTS.production), { mark: 'iron-log qa' })).toContain('is not production');
    expect(await refused('production', argv('production', HOSTS.production), { mark: 'iron-log staging' })).toContain('is not production');
  });
  it('production\'s host unknown (a check that cannot run refuses)', async () => { expect(await refused('qa', argv('qa', HOSTS.qa), { prod: null })).toContain('cannot run'); });
  it('a secret that is not a database URL', async () => { expect(await refused('qa', argv('qa', HOSTS.qa), { url: 'https://example.invalid/x' })).toContain('is not a database URL'); });
  it('a bad command line, before the secret is even read', async () => {
    const f = fakes('qa');
    expect(await f.run(['qa', '--host', HOSTS.qa])).toBe(REFUSED);
    expect(f.reads).toHaveLength(0);
  });
});

describe('warnings and the happy path', () => {
  it('warns (and runs) for a pooled QA or staging host; production\'s unmarked database passes', async () => {
    const pooled = 'ep-stg-1-pooler.c-6.example.invalid';
    const f = fakes('staging', { url: urlFor(pooled) });
    expect(await f.run(argv('staging', pooled))).toBe(0);
    expect(f.logs.join('\n')).toContain('pooled address');
    expect(f.spawned).toHaveLength(1);
    const p = fakes('production');
    expect(await p.run(argv('production', HOSTS.production))).toBe(0);
  });
  it('returns the child\'s exit status', async () => {
    const f = fakes('qa');
    const r = await main(argv('qa', HOSTS.qa), { read: () => f.url, deps: { host: hostOf, notLocal: notLocalProblem, prodUrl: () => urlFor(HOSTS.production), same, mark: async () => 'iron-log qa' }, spawn: () => ({ status: 7 }), log: () => {}, base: {} });
    expect(r).toBe(7);
  });
});

describe('the child\'s environment', () => {
  it('has DATABASE_URL and none of the other database variables, and keeps the rest', async () => {
    const f = fakes('staging');
    const stale = Object.fromEntries(['DATABASE_URL_UNPOOLED', 'BACKUP_DATABASE_URL', 'READER_DATABASE_URL', 'PGSSLMODE', 'PGSSLROOTCERT', 'PROD_DATABASE_URL', 'STAGING_DATABASE_URL', 'QA_DATABASE_URL', 'PGPASSWORD', 'PGHOST'].map(k => [k, 'stale']));
    await f.run(argv('staging', HOSTS.staging), { ...stale, DATABASE_URL: 'stale', PATH: '/bin', HOME: '/h' });
    const env = f.spawned[0].env;
    expect(env.DATABASE_URL).toBe(f.url);
    for (const k of Object.keys(stale)) expect(env[k]).toBeUndefined();
    expect(env.PATH).toBe('/bin');
    expect(env.HOME).toBe('/h');
    expect(f.spawned[0].args.join(' ')).not.toContain(PASSWORD); // never on a command line
  });
  it('childEnv leaves the base object alone', () => {
    const base = { DATABASE_URL: 'x', A: '1' };
    childEnv('postgres://u:p@h/d', base);
    expect(base.DATABASE_URL).toBe('x');
  });
});

describe('the URL never appears in anything printed or thrown', () => {
  it('not on success, nor in any refusal', async () => {
    const seen: string[] = [];
    const cases: [Env, string[], object][] = [
      ['qa', argv('qa', HOSTS.qa), {}],
      ['qa', argv('qa', 'wrong.example.invalid'), {}],
      ['qa', argv('qa', HOSTS.qa), { mark: null }],
      ['staging', argv('staging', HOSTS.production), { url: urlFor(HOSTS.production) }],
      ['production', argv('production', HOSTS.qa), { url: urlFor(HOSTS.qa) }],
      ['qa', argv('qa', HOSTS.qa), { prod: null }],
    ];
    for (const [env, a, over] of cases) { const f = fakes(env, over); await f.run(a); seen.push(...f.logs); }
    expect(seen.length).toBeGreaterThan(0);
    for (const m of seen) { expect(m).not.toContain(PASSWORD); expect(m).not.toContain('postgres://'); }
  });
  it('not in a failure of the injected reader or checker, and not in a thrown check error', async () => {
    const url = urlFor(HOSTS.qa);
    const logs: string[] = [];
    const r = await main(argv('qa', HOSTS.qa), { read: () => url, deps: { host: hostOf, notLocal: notLocalProblem, prodUrl: () => null, same, mark: async () => { throw new Error(`could not connect to ${url}`); } }, spawn: () => ({ status: 0 }), log: m => logs.push(m), base: {} });
    expect(r).toBe(REFUSED);
    const r2 = await main(argv('qa', HOSTS.qa), { read: () => url, deps: { host: hostOf, notLocal: notLocalProblem, prodUrl: () => urlFor(HOSTS.production), same, mark: async () => { throw new Error(`could not connect to ${url}`); } }, spawn: () => ({ status: 0 }), log: m => logs.push(m), base: {} });
    expect(r2).toBe(REFUSED);
    expect(logs.join('\n')).not.toContain(PASSWORD);
    expect(logs.join('\n')).toContain('[hidden]');
    const thrown = await check({ env: 'qa', host: 'wrong.example.invalid', url }, { host: hostOf, notLocal: notLocalProblem, prodUrl: () => urlFor(HOSTS.production), same, mark: async () => 'iron-log qa' }).then(() => null, e => e as Error);
    expect(thrown).not.toBeNull(); // fails if check stops refusing
    expect(thrown!.message).toMatch(/does not match/);
    expect(thrown!.message).not.toContain(PASSWORD);
  });
  it('redaction is what hides the URL: an error carrying it is hidden by main, and is not by the raw message', async () => {
    const url = urlFor(HOSTS.qa);
    const raw = new Error(`boom ${url}`).message;
    expect(raw).toContain(PASSWORD);
    expect(redact(raw, url)).not.toContain(PASSWORD);
  });
  it('a real connect() failure (it exits with its own text) never shows the URL', async () => {
    const url = `postgres://owner:${PASSWORD}@no-such-host.invalid/db`;
    const said: string[] = [];
    const err = console.error; const exit = process.exit;
    console.error = (m: unknown) => { said.push(String(m)); };
    process.exit = ((c?: number) => { throw new Error(`exit ${c}`); }) as typeof process.exit;
    try { await markOf(url, 'qa'); } catch (e) { said.push((e as Error).message); } finally { console.error = err; process.exit = exit; }
    expect(said.join('\n')).toContain('Cannot connect');
    expect(said.join('\n')).not.toContain(PASSWORD);
  }, 30_000);
  it('redact removes the URL, the password (also percent-encoded) and the user', () => {
    const u = 'postgres://own%40er:p%40ss-w0rd-9@h.example.invalid/db';
    const out = redact(`bad ${u} and p@ss-w0rd-9 and p%40ss-w0rd-9 and own@er`, u);
    expect(out).not.toMatch(/p@ss-w0rd-9|p%40ss-w0rd-9|own@er|own%40er|postgres:\/\//);
  });
});

describe('production without an independent copy of production\'s URL', () => {
  it('runs with a warning that the typed host and the mark are the checks (it never compares the secret with itself)', async () => {
    const f = fakes('production', { prod: null });
    expect(await f.run(argv('production', HOSTS.production))).toBe(0);
    expect(f.logs.join('\n')).toContain('no independent copy');
    expect(f.spawned).toHaveLength(1);
  });
  it('still refuses a marked database, and a host that differs from the independent copy', async () => {
    const m = fakes('production', { prod: null, mark: 'iron-log qa' });
    expect(await m.run(argv('production', HOSTS.production))).toBe(REFUSED);
    const d = fakes('production', { prod: urlFor('ep-other.c-6.example.invalid') });
    expect(await d.run(argv('production', HOSTS.production))).toBe(REFUSED);
    expect(d.spawned).toHaveLength(0);
  });
  it('qa and staging still refuse when production\'s host cannot be read', async () => {
    const f = fakes('staging', { prod: null });
    expect(await f.run(argv('staging', HOSTS.staging))).toBe(REFUSED);
  });
});

describe('connect() failures are redacted and become a throw', () => {
  it('replaces console.error and process.exit for the call, restores both, and hides the URL', async () => {
    const url = urlFor(HOSTS.qa);
    const exitBefore = process.exit, errBefore = console.error;
    const said: string[] = [];
    const open = async () => { console.error(`Cannot connect: could not parse ${url}`); process.exit(2); };
    await expect(markOf(url, 'qa', open as never)).rejects.toThrow(/Could not connect/);
    expect(process.exit).toBe(exitBefore);
    expect(console.error).toBe(errBefore);
    await contained(async () => { console.error(`retry ${url}`); }, url, { say: m => said.push(m) });
    expect(said.join('\n')).not.toContain(PASSWORD);
    expect(said.join('\n')).toContain('[hidden]');
  });
});
