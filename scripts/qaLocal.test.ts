// The refusals of scripts/qa-local.mjs (brief: qa-runner-agent): these are what keep the QA Runner agent on this machine and on a scratch database.
import { describe, expect, it } from 'vitest';
import { dropProblem, freePort, markProblem, newScratchName, SCRATCH_MARK, serverProblem, urlProblem } from './qa-local.mjs';

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
  it('allows the database the state file recorded', () => expect(dropProblem(db, { db })).toBeNull());
  it.each(['ironlog', 'ironlog_e2e', 'postgres', 'iron_qa_run_', 'iron_qa_run_0A1B2C3D', 'iron_qa_run_0a1b2c3d; drop database ironlog', 'x"iron_qa_run_0a1b2c3d', ''])('refuses the name %j', name => {
    expect(dropProblem(name, { db: name })).not.toBeNull();
  });
  it('refuses a scratch-looking name that the state file did not record', () => {
    expect(dropProblem(db, { db: 'iron_qa_run_ffffffff' })).toMatch(/did not create/);
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
    expect(dropProblem(a, { db: a })).toBeNull();
    expect(a).not.toBe(b);
  });
  it('picks a free local port that urlProblem allows', async () => {
    const port = await freePort();
    expect(port).toBeGreaterThan(1023);
    expect(urlProblem(`http://127.0.0.1:${port}`)).toBeNull();
  });
});
