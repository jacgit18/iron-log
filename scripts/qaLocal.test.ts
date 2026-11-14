// The refusals of scripts/qa-local.mjs (brief: qa-runner-agent): these are what keep the QA Runner agent on this machine and on a scratch database.
import { describe, expect, it } from 'vitest';
import { dropProblem, dropScratch, freePort, markProblem, newScratchName, originProblem, pidIsStack, SCRATCH_MARK, serverProblem, urlProblem } from './qa-local.mjs';

describe('urlProblem', () => {
  it.each(['http://127.0.0.1:41234', 'http://localhost:41234/', 'http://[::1]:41234/settings'])('allows %s', url => expect(urlProblem(url)).toBeNull());
  it.each([
    'https://iron-log-qa-abc.a.run.app', 'https://staging.example.com', 'https://loadbearer.app', 'http://192.168.1.20:3000', 'http://0.0.0.0:3000',
    'http://127.0.0.1.evil.com:3000', 'http://localhost.evil.com', 'http://user:pw@127.0.0.1:3000', 'https://127.0.0.1:3000', 'ftp://127.0.0.1', 'file:///etc/passwd', 'not a url', '',
  ])('refuses %s', url => expect(urlProblem(url)).not.toBeNull());
  it.each([4173, 3103, 3104, 5433])('refuses port %i, which another session or service holds', port => expect(urlProblem(`http://127.0.0.1:${port}`)).toMatch(/another session/));
});

describe('serverProblem', () => {
  it('allows the local Docker Postgres', () => expect(serverProblem('postgres://ironlog:ironlog@127.0.0.1:5433/ironlog')).toBeNull());
  it.each([
    'postgres://u:p@ep-cool-123.us-east-2.aws.neon.tech/neondb', 'postgres://u:p@10.0.0.5:5432/x', 'postgres://u:p@127.0.0.1.evil.com/x',
    'postgres://u:p@127.0.0.1:5433/x?host=db.prod.example.com', 'postgres://u:p@127.0.0.1:5433/x?hostaddr=10.0.0.5', 'nope',
  ])('refuses %s', url => expect(serverProblem(url)).not.toBeNull());
});

describe('dropProblem', () => {
  const db = 'iron_qa_run_0a1b2c3d';
  it('allows the database the state file recorded', () => expect(dropProblem(db, { db, login: `${db}_app` })).toBeNull());
  it.each(['ironlog', 'ironlog_e2e', 'postgres', 'iron_qa_run_', 'iron_qa_run_0A1B2C3D', 'iron_qa_run_0a1b2c3d; drop database ironlog', 'x"iron_qa_run_0a1b2c3d', ''])('refuses the name %j', name => {
    expect(dropProblem(name, { db: name, login: `${name}_app` })).not.toBeNull();
  });
  it('refuses a scratch-looking name that the state file did not record', () => {
    expect(dropProblem(db, { db: 'iron_qa_run_ffffffff', login: 'iron_qa_run_ffffffff_app' })).toMatch(/did not create/);
    expect(dropProblem(db, { db, login: 'ironlog_app' })).toMatch(/did not create/); // the login must be the one this script made for it
    expect(dropProblem(db, null)).toMatch(/did not create/);
  });
});

describe('markProblem', () => {
  it('needs the mark this script puts on a database', () => {
    expect(markProblem(SCRATCH_MARK)).toBeNull();
    expect(markProblem('iron-log qa')).not.toBeNull(); // the real QA branch's mark is not ours
    expect(markProblem(null)).not.toBeNull();
  });
});

describe('names and ports', () => {
  it('makes a name that dropProblem accepts, different each time', () => {
    const a = newScratchName(); const b = newScratchName();
    expect(dropProblem(a, { db: a, login: `${a}_app` })).toBeNull();
    expect(a).not.toBe(b);
  });
  it('picks a free local port that urlProblem allows', async () => {
    const port = await freePort();
    expect(port).toBeGreaterThan(1023);
    expect(urlProblem(`http://127.0.0.1:${port}`)).toBeNull();
  });
});

describe('originProblem (check-url)', () => {
  const stack = 'http://127.0.0.1:41234';
  it('allows only the address of the stack that was started', () => {
    expect(originProblem('http://127.0.0.1:41234/#/daily', stack)).toBeNull();
    expect(originProblem('http://127.0.0.1:8080', stack)).toMatch(/not the stack/); // another local app
    expect(originProblem('http://localhost:41234', stack)).toMatch(/not the stack/);
    expect(originProblem('https://staging.example.com', stack)).not.toBeNull();
  });
  it('refuses everything when no stack is running', () => expect(originProblem(stack, undefined)).toMatch(/no stack is running/));
});

describe('pidIsStack', () => {
  const root = '/work/iron-log';
  it('kills only this checkout\'s server', () => {
    expect(pidIsStack('npm exec tsx server/index.ts', root, root)).toBe(true);
    expect(pidIsStack('node other.js', root, root)).toBe(false); // a reused pid
    expect(pidIsStack('npx tsx server/index.ts', '/work/other', root)).toBe(false); // another checkout's server
    expect(pidIsStack(null, null, root)).toBe(false);
  });
});

describe('dropScratch', () => {
  const db = 'iron_qa_run_0a1b2c3d';
  const state = { db, login: `${db}_app`, base: 'postgres://u:p@127.0.0.1:5433/ironlog?sslmode=disable' };
  const fake = (comment: string | null, found = true) => {
    const queries: string[] = [];
    const withClient = async (url: string, fn: (c: { query: (q: string) => Promise<{ rows: { comment: string | null }[] }> }) => Promise<void>) => {
      expect(url).toContain('/postgres');
      await fn({ query: async (q: string) => { queries.push(q); return { rows: found ? [{ comment }] : [] }; } });
    };
    return { queries, withClient };
  };
  it('drops the database and the login when the mark matches', async () => {
    const f = fake(SCRATCH_MARK);
    expect(await dropScratch(state, f.withClient)).toBeNull();
    expect(f.queries.some(q => q.startsWith('drop database'))).toBe(true);
    expect(f.queries.some(q => q.startsWith('drop role'))).toBe(true);
  });
  it('drops nothing when the mark is missing or not ours', async () => {
    for (const comment of [null, 'iron-log qa']) {
      const f = fake(comment);
      expect(await dropScratch(state, f.withClient)).toMatch(/could not drop.*mark/);
      expect(f.queries.some(q => q.startsWith('drop'))).toBe(false);
    }
  });
  it('does not even connect for a name or server it must refuse', async () => {
    let connected = false;
    const withClient = async () => { connected = true; };
    expect(await dropScratch({ ...state, db: 'ironlog', login: 'ironlog_app' }, withClient)).not.toBeNull();
    expect(await dropScratch({ ...state, base: 'postgres://u:p@db.example.com/x' }, withClient)).not.toBeNull();
    expect(connected).toBe(false);
  });
  it('is fine when the database is already gone', async () => {
    const f = fake(null, false);
    expect(await dropScratch(state, f.withClient)).toBeNull();
    expect(f.queries.some(q => q.startsWith('drop database'))).toBe(false);
  });
});
