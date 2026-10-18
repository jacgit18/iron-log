import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql, type Kysely } from 'kysely';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.ts';
import { createDb } from './db/connection.ts';
import type { DB } from './db/types.ts';
import { errorHandler, serverIssue } from './errorHandler.ts';
import { issueRecorder } from './issues.ts';
import { startTestDatabase } from './test/postgres.ts';

// The issue store (migration 20261018000001): reports are counted by fingerprint through record_issue(), the app role reaches the table
// only through that function, and the two ways in (a phone's report, a server failure) land in it.
let owner: Kysely<DB>;
let app: Kysely<DB>;
let stop: () => Promise<void>;

beforeAll(async () => {
  let appUrl: string;
  ({ db: owner, stop, appUrl } = await startTestDatabase());
  app = createDb(appUrl);
}, 120_000);
afterAll(async () => {
  await app.destroy();
  await stop?.();
});
beforeEach(async () => {
  await owner.deleteFrom('issues').execute();
  vi.restoreAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

const FP = 'abcdef012345';
const record = (fingerprint = FP, version = '1', kind = 'error') =>
  sql<{ record_issue: string }>`select record_issue(${fingerprint}, ${kind}, 'Bad weight ###', 'foo /assets/index.js:1:2', '/progress', ${version})`.execute(app).then(r => r.rows[0]!.record_issue);
const row = (fingerprint = FP) => owner.selectFrom('issues').selectAll().where('fingerprint', '=', fingerprint).executeTakeFirstOrThrow();

describe('record_issue', () => {
  it('says new for a new fingerprint and repeat for a repeat, and counts the repeats', async () => {
    expect(await record(FP, '10')).toBe('new');
    expect(await record(FP, '11')).toBe('repeat');
    expect(await record(FP, '12')).toBe('repeat');
    const r = await row();
    expect(r).toMatchObject({ occurrences: '3', first_version: '10', last_version: '12', status: 'open', kind: 'error', page: '/progress' });
  });

  it('opens a fixed issue again when it comes back, and leaves ignored and investigating alone', async () => {
    for (const [status, after] of [['fixed', 'open'], ['ignored', 'ignored'], ['investigating', 'investigating']] as const) {
      await owner.deleteFrom('issues').execute();
      await record();
      await owner.updateTable('issues').set({ status }).execute();
      await record();
      expect((await row()).status).toBe(after);
    }
  });

  it('refuses new fingerprints once the table holds 5000 rows that cannot be dropped, but keeps counting the ones it has', async () => {
    await fill(5000);
    expect(await record('ffffffffffff')).toBe('full');
    expect(await owner.selectFrom('issues').select(sql<string>`count(*)`.as('n')).executeTakeFirstOrThrow()).toEqual({ n: '5000' });
    expect(await record(lpad(1))).toBe('repeat');
    expect((await row(lpad(1))).occurrences).toBe('3'); // it was filled in with 2
  });

  it('at the cap, makes room by dropping the oldest report that was seen once, is still open and has no note', async () => {
    await fill(5000, 1);
    await owner.updateTable('issues').set({ last_seen: sql`now() - interval '1 day'` }).where('fingerprint', '=', lpad(7)).execute();
    await owner.updateTable('issues').set({ note: 'looking' }).where('fingerprint', '=', lpad(7)).execute();
    await owner.updateTable('issues').set({ last_seen: sql`now() - interval '2 days'` }).where('fingerprint', '=', lpad(9)).execute();
    expect(await record('ffffffffffff')).toBe('new');
    const kept = (await owner.selectFrom('issues').select('fingerprint').execute()).map(r => r.fingerprint);
    expect(kept).toHaveLength(5000);
    expect(kept).not.toContain(lpad(9)); // the oldest untouched one went
    expect(kept).toContain(lpad(7)); // older than the rest of the table, but it has a note, so it stays
    expect(kept).toContain('ffffffffffff');
  });

  it('never goes past 5000 when many new fingerprints arrive at once, even with the cap taken by rows that cannot be dropped plus newcomers', async () => {
    await fill(4990);
    const results = await Promise.all(Array.from({ length: 30 }, (_, i) => record(`a${i.toString(16).padStart(11, '0')}`)));
    // Past the cap each newcomer displaces the oldest seen-once row (an earlier newcomer), so all are stored; the table never grows past 5000.
    expect(results.every(r => r === 'new')).toBe(true);
    expect(await owner.selectFrom('issues').select(sql<string>`count(*)`.as('n')).executeTakeFirstOrThrow()).toEqual({ n: '5000' });
  });

  it('rejects a malformed fingerprint or kind', async () => {
    await expect(record('NOT-A-HASH')).rejects.toThrow();
    await expect(record(FP, '1', 'nonsense')).rejects.toThrow();
  });

  it('is the only way in for the app role: it cannot read or write the table itself', async () => {
    for (const statement of [sql`select * from issues`, sql`insert into issues (fingerprint, kind, message) values (${FP}, 'error', 'm')`, sql`update issues set status = 'fixed'`, sql`delete from issues`]) {
      await expect(statement.execute(app)).rejects.toThrow(/permission denied/);
    }
  });
});

// Rows nobody can drop to make room: each was seen twice.
const fill = (n: number, occurrences = 2) => sql`insert into issues (fingerprint, kind, message, occurrences) select lpad(to_hex(g), 12, '0'), 'error', 'm', ${occurrences} from generate_series(1, ${n}) g`.execute(owner);
const lpad = (n: number) => n.toString(16).padStart(12, '0');
const stored = () => owner.selectFrom('issues').selectAll().orderBy('first_seen').execute();

describe('issueRecorder', () => {
  it('sends the same fingerprint at most once in the throttle window', async () => {
    let t = 1_000_000;
    const recordIssue = issueRecorder(app, () => t);
    const input = { fingerprint: FP, kind: 'server' as const, message: 'm', topFrame: '', page: '/x', version: '' };
    recordIssue(input);
    recordIssue(input);
    await vi.waitFor(async () => expect(await stored()).toHaveLength(1));
    t += 6_000;
    recordIssue(input);
    await vi.waitFor(async () => expect((await row()).occurrences).toBe('2'));
  });

  it('keeps the newest 500 fingerprints in its memory, oldest sent first', async () => {
    let t = 1_000_000;
    const recordIssue = issueRecorder(app, () => t);
    const send = (n: number) => recordIssue({ fingerprint: lpad(n), kind: 'server', message: 'm', topFrame: '', page: '', version: '' });
    for (let n = 1; n <= 501; n++) send(n); // 501 distinct: the first one is forgotten, the rest are remembered
    await vi.waitFor(async () => expect(await stored()).toHaveLength(501));
    send(2); // remembered and inside the window: not sent again
    send(1); // forgotten: sent again, so it is counted twice
    await vi.waitFor(async () => expect((await row(lpad(1))).occurrences).toBe('2'));
    expect((await row(lpad(2))).occurrences).toBe('1');
  });

  it('logs a loud issues-full line when a new problem is refused because the table is full', async () => {
    await fill(5000);
    issueRecorder(app)({ fingerprint: 'ffffffffffff', kind: 'error', message: 'm', topFrame: '', page: '', version: '' });
    await vi.waitFor(() => expect(vi.mocked(console.error).mock.calls.map(c => JSON.parse(c[0] as string))).toContainEqual({ severity: 'ERROR', msg: 'issues-full', fingerprint: 'ffffffffffff', kind: 'error' }));
  });

  it('logs one new-issue line the first time, and swallows a failure', async () => {
    const log = vi.mocked(console.error);
    const recordIssue = issueRecorder(app);
    recordIssue({ fingerprint: FP, kind: 'error', message: 'm', topFrame: '', page: '', version: '1' });
    await vi.waitFor(() => expect(log.mock.calls.map(c => JSON.parse(c[0] as string))).toContainEqual({ severity: 'WARNING', msg: 'new-issue', fingerprint: FP, kind: 'error' }));
    // A bad fingerprint makes the database refuse: logged, never thrown.
    expect(() => recordIssue({ fingerprint: 'bad', kind: 'error', message: 'm', topFrame: '', page: '', version: '' })).not.toThrow();
    await vi.waitFor(() => expect(log.mock.calls.some(c => String(c[0]).includes('issue not recorded'))).toBe(true));
  });
});

describe('the two ways in', () => {
  let server: Server;
  const listen = async (a: express.Express) => {
    server = a.listen(0);
    await new Promise(done => server.once('listening', done));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };
  const close = () => new Promise<void>(done => server.close(() => done()));

  it('a phone report through /api/client-errors is stored with its fingerprint', async () => {
    const base = await listen(createApp({ db: app }));
    const res = await fetch(`${base}/api/client-errors`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'sync', message: 'refused 181 lb', page: '/progress', version: '77' }) });
    expect(res.status).toBe(204);
    await vi.waitFor(async () => expect(await stored()).toHaveLength(1));
    expect((await stored())[0]).toMatchObject({ kind: 'sync', message: 'refused ### lb', page: '/progress', last_version: '77', occurrences: '1' });
    await close();
  });

  it('a recorder that throws does not change the answer, and a failure after the response started is still recorded', async () => {
    const seen: string[] = [];
    const a = express();
    a.get('/boom', () => { throw new Error('boom'); });
    a.get('/late', (_req, res) => { res.write('partial'); throw new Error('late failure'); });
    a.use(errorHandler(i => { seen.push(i.message); if (i.message === 'boom') throw new Error('recorder broke'); }));
    const base = await listen(a);
    const res = await fetch(`${base}/boom`);
    expect(res.status).toBe(500);
    expect((await res.json()) as { ok: boolean }).toMatchObject({ ok: false });
    await fetch(`${base}/late`).then(r => r.text()).catch(() => '');
    expect(seen).toEqual(['boom', 'late failure']);
    await close();
  });

  it('a 500 is stored, a 404 and a 400 are not', async () => {
    const a = express();
    a.get('/boom', () => { throw new Error('duplicate key value violates "exercise bench press 185"'); });
    a.get('/bad', () => { throw Object.assign(new Error('bad'), { status: 400 }); });
    a.use(errorHandler(issueRecorder(app)));
    const base = await listen(a);
    expect((await fetch(`${base}/boom`)).status).toBe(500);
    expect((await fetch(`${base}/bad`)).status).toBe(400);
    await vi.waitFor(async () => expect(await stored()).toHaveLength(1));
    const [r] = await stored();
    expect(r).toMatchObject({ kind: 'server', page: '/boom', message: 'duplicate key value violates "…"' });
    await close();
  });
});

describe('serverIssue', () => {
  it('leaves apostrophes in plain words alone, masks the path, and cuts only real quotes', () => {
    const r = serverIssue(new Error("user's row can't be saved because it isn't valid (reading 'weight')"), '/api/catalog/c:fedb:12345');
    expect(r.message).toBe("user's row can't be saved because it isn't valid (reading '…')");
    expect(r.page).toBe('/api/catalog/c:fedb:#####');
  });

  it('keeps no quoted value, digit, email or token from the message', () => {
    const r = serverIssue(new Error(`invalid input for "bench press" 185 lb by jane@example.com token ghp_abcdefghijklmnop 'note text'`), '/api/x');
    expect(r.message).toBe('invalid input for "…" ### lb by [email] token [secret] \'…\'');
    expect(r.fingerprint).toMatch(/^[0-9a-f]{12}$/);
  });

  it('gives one fingerprint to the same failure with different values', () => {
    const a = serverIssue(new Error('row 12 for "squat" failed'), '/api/x');
    const b = serverIssue(new Error('row 3456 for "deadlift" failed'), '/api/y');
    expect(a.fingerprint).toBe(b.fingerprint);
  });
});
