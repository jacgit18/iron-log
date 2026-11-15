// The refusals of scripts/qa-local.mjs (brief: qa-runner-agent): these are what keep the QA Runner agent on this machine and on a scratch database.
import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { LOCAL_ADMIN_EMAIL, LOCAL_ADMIN_ID, pickerEnv } from '../server/qa/localAdmin.ts';
import { QA_LOCAL_MARK } from '../server/auth/qaPersonas.ts';
import { join } from 'node:path';
import { BROWSER_FLAGS, dropProblem, dropScratch, finishStop, freePort, markProblem, newScratchName, originProblem, pidIsStack, removeSignInFiles, SCRATCH_MARK, seedToken, serverProblem, signInFilesIn, signInHtml, signInNames, signInScript, urlProblem } from './qa-local.mjs';

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

describe('the sign-in page', () => {
  const script = signInScript(BROWSER_FLAGS, 'qa+new@example.test', 'pw"; alert(1); "');
  it('sets every browser flag, posts to the stack\'s own sign-in path and opens /', () => {
    for (const k of Object.keys(BROWSER_FLAGS)) expect(script).toContain(JSON.stringify(k));
    expect(script).toContain("fetch('/api/auth/sign-in/email'");
    expect(script).toContain("location.replace('/')");
  });
  it('quotes the email and password as data, never as code', () => expect(script).toContain('password: "pw\\"; alert(1); \\""'));
  it('never names another origin', () => expect(script).not.toMatch(/https?:|\/\/\w/));
  it('is loaded as a script file of the stack\'s own origin (the CSP forbids inline script)', () => {
    const html = signInHtml(signInNames('erased-account').script, 'abc123');
    expect(html).toContain('<script src="/qa-signin-erased-account.js?s=abc123">');
    expect(html.split('<script').length - 1).toBe(1); // the one script tag is the one with the src: no inline script
    expect(html).not.toContain('<script>');
  });
  it('names the page and script per persona, so a browser cache of one persona never signs in another (the server caches static files for an hour)', () => {
    expect(signInNames('erased-account')).toEqual({ page: 'qa-signin-erased-account.html', script: 'qa-signin-erased-account.js' });
    expect(signInNames('grocery-at-cap').script).not.toBe(signInNames('erased-account').script);
  });
});

describe('the sign-in cache and clean-up', () => {
  it('makes a new token for each seed, so a cached copy of an earlier seed is never used', () => {
    expect(seedToken()).toMatch(/^[0-9a-f]{12}$/);
    expect(seedToken(Buffer.from('aaaaaa'))).not.toBe(seedToken(Buffer.from('bbbbbb')));
  });
  it('picks only qa-signin-<persona>.html and .js out of a folder, and nothing from a missing one', () => {
    expect(signInFilesIn(['index.html', 'qa-signin-erased-account.js', 'qa-signin-grocery-at-cap.html', 'qa-signin.js', 'qa-signin-x.css', 'qa-signin-X.js', 'assets'])).toEqual(['qa-signin-erased-account.js', 'qa-signin-grocery-at-cap.html']);
    expect(signInFilesIn(null)).toEqual([]);
  });
  it('removes the sign-in files and leaves every other file; a missing folder is not an error', () => {
    const dist = mkdtempSync(join(tmpdir(), 'qa-local-test-'));
    for (const n of ['index.html', 'qa-signin-erased-account.js', 'qa-signin-erased-account.html', 'qa-signin.js', 'notes.txt']) writeFileSync(join(dist, n), 'x');
    mkdirSync(join(dist, 'assets'));
    removeSignInFiles(dist);
    expect(readdirSync(dist).sort()).toEqual(['assets', 'index.html', 'notes.txt', 'qa-signin.js']);
    expect(() => removeSignInFiles(join(dist, 'no-such-folder'))).not.toThrow();
  });
  it('removes the sign-in files before the drop, so a failed drop never leaves the scratch password served', async () => {
    const order: string[] = [];
    const state = { db: 'iron_qa_run_0123abcd', login: 'iron_qa_run_0123abcd_app', base: 'postgres://u:p@127.0.0.1:5433/ironlog' };
    const why = await finishStop(state, async () => { order.push('drop'); throw new Error('connection refused'); }, () => order.push('files'));
    expect(order).toEqual(['files', 'drop']);
    expect(why).toMatch(/could not drop.*connection refused/);
  });
});

describe('the picker on the scratch stack (brief: qa-runner-test-admin)', () => {
  it('the server accepts the mark this script puts on the scratch database', () => expect(QA_LOCAL_MARK).toBe(SCRATCH_MARK));
  it('turns the picker on with exactly one admin, a test address that cannot be real, and the scratch database as the owner URL', () => {
    const env = pickerEnv('postgres://x@127.0.0.1:5433/iron_qa_run_0a1b2c3d');
    expect(env).toEqual({ QA_PERSONAS: 'true', ADMIN_EMAILS: LOCAL_ADMIN_EMAIL, QA_OWNER_DATABASE_URL: 'postgres://x@127.0.0.1:5433/iron_qa_run_0a1b2c3d' });
    expect(LOCAL_ADMIN_EMAIL).toMatch(/^[a-z0-9-]+@qa\.invalid$/);
    expect(env.ADMIN_EMAILS).not.toContain(',');
    expect(LOCAL_ADMIN_ID).toMatch(/^[a-z0-9-]+$/); // matches the guard's persona id pattern, so `seed` of it is allowed
  });
});
