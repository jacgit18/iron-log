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
const planned = { d: '2026-10-07', ph: 'strength', w: 135, s: 3, r: 5, slot: 's1', wk: WK, auto: true };

async function send(path: string, body: unknown, user = 'owner') {
  const res = await fetch(`${base}/api/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dev-user': user, 'x-client-version': 'test-1' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}
const tick = (clientId: string, exerciseId = 'squat', over: object = {}, user = 'owner') =>
  send('commands/tick-card', { clientId, baseVersion: null, input: { exerciseId, entry: { ...planned, ...over } } }, user);
const hand = (clientId: string, exerciseId = 'squat', over: object = {}) =>
  send('commands/log-session', { clientId, baseVersion: null, input: { exerciseId, entry: { d: '2026-10-07', w: 140, s: 3, r: 5, slot: 's1', wk: WK, ...over } } });
const untick = (input: object, clientId = 'u1', user = 'owner') => send('commands/untick-card', { clientId, baseVersion: null, input }, user);
const row = (clientId: string) => db.selectFrom('log_entries').selectAll().where('client_id', '=', clientId).executeTakeFirstOrThrow();
const liveIds = async () => (await db.selectFrom('log_entries').select('client_id').where('deleted_at', 'is', null).execute()).map(r => r.client_id).sort();

describe('untick-card', () => {
  it('tombstones the check-off, bumps its version and seq, and returns it', async () => {
    const ticked = await tick('t1');
    const res = await untick({ slot: 's1', wk: WK });
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0]).toMatchObject({ client_id: 't1', version: 2 });
    expect(res.body.rows[0].deleted_at).not.toBeNull();
    expect(Number(res.body.cursor)).toBeGreaterThan(Number(ticked.body.cursor));
    expect(res.body.rows[0].seq).toBe(res.body.cursor);
    expect(await liveIds()).toEqual([]);
  });

  it('keeps the old row in row_history', async () => {
    await tick('t1');
    await untick({ slot: 's1', wk: WK });
    const history = await db.selectFrom('row_history').selectAll().execute();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ table_name: 'log_entries', version: 1 });
  });

  it('leaves a hand-logged session alone unless removeLogged is set', async () => {
    await hand('hand1', 'bench');
    await tick('t1');
    await untick({ slot: 's1', wk: WK });
    expect(await liveIds()).toEqual(['hand1']);
  });

  it('removes what was logged by hand for the card and week with removeLogged', async () => {
    await hand('hand1', 'bench');
    await hand('hand2', 'bench');
    await tick('t1');
    const res = await untick({ slot: 's1', wk: WK, removeLogged: true });
    expect(res.body.rows.map((r: any) => r.client_id).sort()).toEqual(['hand1', 'hand2', 't1']);
    expect(new Set(res.body.rows.map((r: any) => r.seq)).size).toBe(1);
    expect(await liveIds()).toEqual([]);
  });

  it('covers every exercise on the card, including one the card no longer has (rule 7)', async () => {
    await tick('t1', 'squat');
    await tick('t2', 'old-exercise');
    const res = await untick({ slot: 's1', wk: WK });
    expect(res.body.rows).toHaveLength(2);
    expect(await liveIds()).toEqual([]);
  });

  it('with an exerciseId only touches that exercise', async () => {
    await tick('t1', 'squat');
    await tick('t2', 'bench');
    await hand('hand1', 'squat', { slot: 's1' });
    const res = await untick({ slot: 's1', wk: WK, exerciseId: 'squat', removeLogged: true });
    expect(res.body.rows.map((r: any) => r.client_id).sort()).toEqual(['hand1']);
    expect(await liveIds()).toEqual(['t2']);
  });

  it.each([
    ['another week', { slot: 's1', wk: '2026-09-27' }],
    ['another card slot', { slot: 's2', wk: WK }],
  ])('leaves the check-off for %s', async (_name, input) => {
    await tick('t1');
    const res = await untick({ ...input, removeLogged: true });
    expect(res.body.rows).toEqual([]);
    expect(await liveIds()).toEqual(['t1']);
  });

  it('does nothing when nothing is ticked, and does not move the cursor', async () => {
    const t = await tick('t1');
    await untick({ slot: 's1', wk: WK });
    const user = await db.selectFrom('users').select('change_seq').executeTakeFirstOrThrow();
    const again = await untick({ slot: 's1', wk: WK }, 'u2');
    expect(again.status).toBe(200);
    expect(again.body.rows).toEqual([]);
    expect(again.body.cursor).toBe(user.change_seq);
    expect(Number(again.body.cursor)).toBeGreaterThan(Number(t.body.cursor));
    expect((await row('t1')).version).toBe(2);
  });

  it('leaves another user alone', async () => {
    await tick('t1', 'squat', {}, 'owner');
    await tick('t1', 'squat', {}, 'tester');
    await untick({ slot: 's1', wk: WK, removeLogged: true }, 'u1', 'tester');
    const rows = await db.selectFrom('log_entries').select(['user_id', 'deleted_at']).orderBy('user_id').execute();
    expect(rows.map(r => r.deleted_at !== null)).toEqual([false, true]);
  });

  it('lets the card be ticked again afterwards', async () => {
    await tick('t1');
    await untick({ slot: 's1', wk: WK });
    const res = await tick('t2');
    expect(res.status).toBe(201);
    expect(await liveIds()).toEqual(['t2']);
  });

  it('is delivered by the sync pull as a tombstone (reconciliation)', async () => {
    await tick('t1');
    const res = await untick({ slot: 's1', wk: WK });
    const pulled = (await (await fetch(`${base}/api/sync?since=0`, { headers: { 'x-dev-user': 'owner' } })).json()) as any;
    expect(pulled.rows.map((r: any) => [r.client_id, r.deleted_at !== null])).toEqual([['t1', true]]);
    expect(pulled.cursor).toBe(res.body.cursor);
  });
});

describe('untick-card refusals', () => {
  const refusedWrites = () => db.selectFrom('refused_writes').selectAll().execute();

  it.each([
    ['no slot', { wk: WK }],
    ['a bad week', { slot: 's1', wk: 'nope' }],
    ['a bad exercise id', { slot: 's1', wk: WK, exerciseId: '' }],
    ['a non-boolean removeLogged', { slot: 's1', wk: WK, removeLogged: 'yes' }],
  ])('refuses %s with 422 and records it', async (_name, input) => {
    await tick('t1');
    const res = await untick(input);
    expect(res.status).toBe(422);
    expect(res.body.refused).toBe('invalid-input');
    expect(await liveIds()).toEqual(['t1']);
    expect(await refusedWrites()).toHaveLength(1);
    expect((await refusedWrites())[0]).toMatchObject({ command: 'untick-card', client_id: 'u1', reason: 'invalid-input' });
  });

  it('refuses a base version and a malformed envelope', async () => {
    const withBase = await send('commands/untick-card', { clientId: 'u1', baseVersion: 1, input: { slot: 's1', wk: WK } });
    expect(withBase.body.refused).toBe('invalid-input');
    const noId = await send('commands/untick-card', { baseVersion: null, input: { slot: 's1', wk: WK } });
    expect(noId.status).toBe(422);
    expect(noId.body.refused).toBe('bad-envelope');
  });

  it('needs a signed-in user', async () => {
    const res = await fetch(`${base}/api/commands/untick-card`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(401);
  });
});
