import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import type { DB } from '../db/types.ts';
import { startTestDatabase } from '../test/postgres.ts';

let db: Kysely<DB>;
let stop: () => Promise<void>;
let server: Server;
let base: string;

beforeAll(async () => {
  ({ db, stop } = await startTestDatabase());
  server = createApp({ db }).listen(0);
  await new Promise(done => server.once('listening', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 120_000);

afterAll(async () => {
  await new Promise<void>(done => server.close(() => done()));
  await stop?.();
});

beforeEach(async () => {
  await db.deleteFrom('users').execute();
});

const WK = '2026-10-04';
const weighIn = { wk: WK, d: '2026-10-07', w: 180.5 };

async function send(path: string, body: unknown, user = 'owner') {
  const res = await fetch(`${base}/api/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dev-user': user, 'x-client-version': 'test-1' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}
const log = (baseVersion: number | null, input: object = weighIn, clientId = 'b1', user = 'owner') => send('commands/log-body-weight', { clientId, baseVersion, input }, user);
const del = (baseVersion: number | null, wk = WK, clientId = 'd1', user = 'owner') => send('commands/delete-body-weight', { clientId, baseVersion, input: { wk } }, user);
const row = (wk = WK, userName = 'owner') =>
  db.selectFrom('body_entries').innerJoin('users', 'users.id', 'body_entries.user_id').selectAll('body_entries').where('users.auth_user_id', '=', `dev:${userName}`).where('wk', '=', wk).executeTakeFirstOrThrow();
const refusedWrites = () => db.selectFrom('refused_writes').selectAll().execute();

describe('log-body-weight create', () => {
  it('saves one row and bumps the cursor', async () => {
    const res = await log(null);
    expect(res.status).toBe(201);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0]).toMatchObject({ wk: WK, d: '2026-10-07', weight_lb: '180.5000', version: 1, deleted_at: null });
    expect(res.body.cursor).toBe(res.body.rows[0].seq);
    const user = await db.selectFrom('users').select('change_seq').executeTakeFirstOrThrow();
    expect(user.change_seq).toBe(res.body.cursor);
  });

  it('returns the same row for a retry and writes nothing new', async () => {
    const first = await log(null);
    const retry = await log(null);
    expect(retry.status).toBe(200);
    expect(retry.body.rows[0].id).toBe(first.body.rows[0].id);
    expect(retry.body.cursor).toBe(first.body.cursor);
    expect(await db.selectFrom('body_entries').selectAll().execute()).toHaveLength(1);
  });

  it('refuses a second, different weigh-in for the same week with the current row', async () => {
    await log(null);
    const res = await log(null, { ...weighIn, w: 182 }, 'b2');
    expect(res.status).toBe(409);
    expect(res.body.refused).toBe('stale');
    expect(res.body.current).toMatchObject({ wk: WK, weight_lb: '180.5000' });
    expect(await db.selectFrom('body_entries').selectAll().execute()).toHaveLength(1);
    expect((await refusedWrites())[0]).toMatchObject({ command: 'log-body-weight', reason: 'stale' });
  });

  it('keeps one row per week and lets another week or another user have their own', async () => {
    await log(null);
    expect((await log(null, { ...weighIn, wk: '2026-10-11' })).status).toBe(201);
    expect((await log(null, weighIn, 'b1', 'tester')).status).toBe(201);
    expect(await db.selectFrom('body_entries').selectAll().execute()).toHaveLength(3);
  });

  it('survives the same weigh-in sent at once', async () => {
    const results = await Promise.all([log(null), log(null), log(null)]);
    expect(results.every(r => r.status === 200 || r.status === 201)).toBe(true);
    expect(await db.selectFrom('body_entries').selectAll().execute()).toHaveLength(1);
  });
});

describe('log-body-weight edit', () => {
  it('updates the row with the version the phone saw and keeps the old one in row_history', async () => {
    await log(null);
    const res = await log(1, { ...weighIn, w: 181.2, d: '2026-10-08' });
    expect(res.status).toBe(200);
    expect(res.body.rows[0]).toMatchObject({ version: 2, weight_lb: '181.2000', d: '2026-10-08' });
    const history = await db.selectFrom('row_history').selectAll().execute();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ table_name: 'body_entries', version: 1 });
  });

  it('refuses a stale edit with the current row', async () => {
    await log(null);
    await log(1, { ...weighIn, w: 181 });
    const res = await log(1, { ...weighIn, w: 183 });
    expect(res.status).toBe(409);
    expect(res.body.refused).toBe('stale');
    expect(res.body.current).toMatchObject({ version: 2, weight_lb: '181.0000' });
  });

  it('treats an edit retry as a success once its values are already stored', async () => {
    await log(null);
    await log(1, { ...weighIn, w: 181 });
    const retry = await log(1, { ...weighIn, w: 181 });
    expect(retry.status).toBe(200);
    expect(retry.body.rows[0].version).toBe(2);
    expect(await refusedWrites()).toHaveLength(0);
  });

  it('refuses an edit of a week that has no row', async () => {
    const res = await log(1);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ refused: 'not-found', current: null });
  });
});

describe('delete-body-weight', () => {
  it('tombstones the row, bumps version and seq, and returns it', async () => {
    const made = await log(null);
    const res = await del(1);
    expect(res.status).toBe(200);
    expect(res.body.rows[0]).toMatchObject({ wk: WK, version: 2 });
    expect(res.body.rows[0].deleted_at).not.toBeNull();
    expect(Number(res.body.cursor)).toBeGreaterThan(Number(made.body.cursor));
    expect((await row()).weight_lb).toBe('180.5000');
  });

  it('is a success that changes nothing when the week is already deleted', async () => {
    await log(null);
    const first = await del(1);
    const retry = await del(1);
    expect(retry.status).toBe(200);
    expect(retry.body.cursor).toBe(first.body.cursor);
    expect(await refusedWrites()).toHaveLength(0);
  });

  it('refuses with the current row when the weigh-in was edited since (FM-05)', async () => {
    await log(null);
    await log(1, { ...weighIn, w: 181 });
    const res = await del(1);
    expect(res.status).toBe(409);
    expect(res.body.refused).toBe('stale');
    expect(res.body.current).toMatchObject({ version: 2 });
    expect((await row()).deleted_at).toBeNull();
  });

  it("refuses a week with no row, and can't reach another user's", async () => {
    expect((await del(1, '2026-10-11')).body.refused).toBe('not-found');
    await log(null, weighIn, 'b1', 'tester');
    expect((await del(1)).body.refused).toBe('not-found');
    expect((await row(WK, 'tester')).deleted_at).toBeNull();
  });

  it('then refuses an edit of the deleted week with the tombstone (FM-05)', async () => {
    await log(null);
    await del(1);
    const res = await log(1, { ...weighIn, w: 190 });
    expect(res.status).toBe(409);
    expect(res.body.refused).toBe('deleted');
    expect(res.body.current.deleted_at).not.toBeNull();
  });

  it('revives the same row when the deleted week is logged again', async () => {
    const first = await log(null);
    await del(1);
    const res = await log(null, { ...weighIn, w: 179 }, 'b2');
    expect(res.status).toBe(200);
    expect(res.body.rows[0]).toMatchObject({ id: first.body.rows[0].id, version: 3, weight_lb: '179.0000', deleted_at: null });
    expect(await db.selectFrom('body_entries').selectAll().execute()).toHaveLength(1);
  });
});

describe('body weight in the sync pull (reconciliation)', () => {
  const pull = async (query = 'since=0') => (await (await fetch(`${base}/api/sync?${query}`, { headers: { 'x-dev-user': 'owner' } })).json()) as any;

  it('delivers weigh-ins and tombstones next to log entries, in seq order', async () => {
    await send('commands/log-session', { clientId: 'e1', baseVersion: null, input: { exerciseId: 'squat', entry: { d: '2026-10-07', w: 135 } } });
    await log(null);
    await log(null, { ...weighIn, wk: '2026-10-11' });
    const res = await del(1, '2026-10-11');
    const page = await pull();
    expect(page.rows.map((r: any) => [r.table, r.client_id ?? r.wk, r.deleted_at !== null])).toEqual([
      ['log_entries', 'e1', false],
      ['body_entries', WK, false],
      ['body_entries', '2026-10-11', true],
    ]);
    expect(page.cursor).toBe(res.body.cursor);
    expect(page.more).toBe(false);
  });

  it('pages across both tables without splitting a command', async () => {
    await send('commands/log-session', { clientId: 'e1', baseVersion: null, input: { exerciseId: 'squat', entry: { d: '2026-10-07', w: 135 } } });
    await log(null);
    await log(null, { ...weighIn, wk: '2026-10-11' });
    const seen: string[] = [];
    let since = '0';
    for (let i = 0; i < 5; i++) {
      const page = await pull(`since=${since}&limit=1`);
      seen.push(...page.rows.map((r: any) => `${r.table}:${r.client_id ?? r.wk}`));
      since = page.cursor;
      if (!page.more) break;
    }
    expect(seen).toEqual(['log_entries:e1', `body_entries:${WK}`, 'body_entries:2026-10-11']);
  });
});

describe('body weight refusals', () => {
  it.each([
    ['a bad week', 'log-body-weight', { ...weighIn, wk: 'nope' }, null],
    ['a missing weight', 'log-body-weight', { wk: WK, d: '2026-10-07' }, null],
    ['an out-of-range weight', 'log-body-weight', { ...weighIn, w: 1500 }, null],
    ['no base version on a delete', 'delete-body-weight', { wk: WK }, null],
    ['a bad week on a delete', 'delete-body-weight', { wk: 'nope' }, 1],
  ])('refuses %s with 422 and records it', async (_name, command, input, baseVersion) => {
    const res = await send(`commands/${command}`, { clientId: 'x1', baseVersion, input });
    expect(res.status).toBe(422);
    expect(res.body.refused).toBe('invalid-input');
    expect(await db.selectFrom('body_entries').selectAll().execute()).toHaveLength(0);
    expect((await refusedWrites())[0]).toMatchObject({ command, reason: 'invalid-input' });
  });

  it.each(['log-body-weight', 'delete-body-weight'])('refuses a malformed %s envelope', async command => {
    const res = await send(`commands/${command}`, { baseVersion: 1, input: { wk: WK } });
    expect(res.status).toBe(422);
    expect(res.body.refused).toBe('bad-envelope');
  });

  it.each(['log-body-weight', 'delete-body-weight'])('needs a signed-in user for %s', async command => {
    const res = await fetch(`${base}/api/commands/${command}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(401);
  });
});
