import { describe, expect, it } from 'vitest';
import { main } from './db-sm.mjs';
import { ENVS, check, childEnv, parseArgs, redact } from './lib/db-sm.mjs';
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
    expect(await f.run(a)).toBe(2);
    expect(f.spawned).toHaveLength(0);
    return f.logs.join('\n');
  };
  it('--host that differs from the secret\'s host', async () => { expect(await refused('staging', argv('staging', 'other.example.invalid'))).toContain('does not match'); });
  it('a localhost URL', async () => { expect(await refused('qa', argv('qa', 'localhost'), { url: urlFor('localhost') })).toContain('on this machine'); });
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
    expect(await f.run(['qa', '--host', HOSTS.qa])).toBe(2);
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
    const r = await main(argv('qa', HOSTS.qa), { read: () => f.url, deps: { host: hostOf, prodUrl: () => urlFor(HOSTS.production), same, mark: async () => 'iron-log qa' }, spawn: () => ({ status: 7 }), log: () => {}, base: {} });
    expect(r).toBe(7);
  });
});

describe('the child\'s environment', () => {
  it('has DATABASE_URL and none of the other database variables, and keeps the rest', async () => {
    const f = fakes('staging');
    const stale = Object.fromEntries(['DATABASE_URL_UNPOOLED', 'PROD_DATABASE_URL', 'STAGING_DATABASE_URL', 'QA_DATABASE_URL', 'PGPASSWORD', 'PGHOST'].map(k => [k, 'stale']));
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
    const r = await main(argv('qa', HOSTS.qa), { read: () => url, deps: { host: hostOf, prodUrl: () => null, same, mark: async () => { throw new Error(`could not connect to ${url}`); } }, spawn: () => ({ status: 0 }), log: m => logs.push(m), base: {} });
    expect(r).toBe(2);
    const r2 = await main(argv('qa', HOSTS.qa), { read: () => url, deps: { host: hostOf, prodUrl: () => urlFor(HOSTS.production), same, mark: async () => { throw new Error(`could not connect to ${url}`); } }, spawn: () => ({ status: 0 }), log: m => logs.push(m), base: {} });
    expect(r2).toBe(2);
    expect(logs.join('\n')).not.toContain(PASSWORD);
    expect(logs.join('\n')).toContain('[hidden]');
    await expect(check({ env: 'qa', host: 'wrong.example.invalid', url }, { host: hostOf, prodUrl: () => urlFor(HOSTS.production), same, mark: async () => 'iron-log qa' }).catch(e => { throw new Error(e.message); })).rejects.toThrow(/does not match/);
    await check({ env: 'qa', host: 'wrong.example.invalid', url }, { host: hostOf, prodUrl: () => urlFor(HOSTS.production), same, mark: async () => 'iron-log qa' }).catch(e => expect(e.message).not.toContain(PASSWORD));
  });
  it('redact removes the URL, the password (also percent-encoded) and the user', () => {
    const u = 'postgres://own%40er:p%40ss-w0rd-9@h.example.invalid/db';
    const out = redact(`bad ${u} and p@ss-w0rd-9 and p%40ss-w0rd-9 and own@er`, u);
    expect(out).not.toMatch(/p@ss-w0rd-9|p%40ss-w0rd-9|own@er|own%40er|postgres:\/\//);
  });
});
