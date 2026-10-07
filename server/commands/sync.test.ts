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

async function listen() {
  const s = createApp({ db }).listen(0);
  await new Promise(done => s.once('listening', done));
  return { server: s, base: `http://127.0.0.1:${(s.address() as AddressInfo).port}` };
}

beforeAll(async () => {
  ({ db, stop } = await startTestDatabase());
  ({ server, base } = await listen());
}, 120_000);

afterAll(async () => {
  await new Promise<void>(done => server.close(() => done()));
  await stop?.();
});

beforeEach(async () => {
  await db.deleteFrom('users').execute();
});

const entry = (d: string, w = 100) => ({ d, w, s: 1, r: 5 });
const headers = (user: string) => ({ 'content-type': 'application/json', 'x-dev-user': user });

async function post(clientId: string, baseVersion: number | null, e: object, user = 'owner', at = base) {
  const res = await fetch(`${at}/api/commands/log-session`, { method: 'POST', headers: headers(user), body: JSON.stringify({ clientId, baseVersion, input: { exerciseId: 'squat', entry: e } }) });
  return { status: res.status, body: (await res.json()) as any };
}

async function pull(since: string | number = 0, user = 'owner', query = '', at = base) {
  const res = await fetch(`${at}/api/sync?since=${since}${query}`, { headers: headers(user) });
  return { status: res.status, body: (await res.json()) as any };
}

describe('GET /api/sync', () => {
  it('answers 401 without a dev user', async () => {
    expect((await fetch(`${base}/api/sync`)).status).toBe(401);
  });

  it('returns nothing and the same cursor for a new user', async () => {
    expect((await pull()).body).toEqual({ rows: [], cursor: '0', more: false });
  });

  it('returns a posted session, tagged with its table', async () => {
    const saved = (await post('c1', null, entry('2026-10-07'))).body.rows[0];
    const { body } = await pull();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toMatchObject({ table: 'log_entries', id: saved.id, client_id: 'c1', version: 1, d: '2026-10-07' });
    expect(body.cursor).toBe(saved.seq);
    expect(body.more).toBe(false);
  });

  it('returns only what changed after the cursor', async () => {
    await post('c1', null, entry('2026-10-05'));
    const cursor = (await pull()).body.cursor;
    await post('c2', null, entry('2026-10-06'));
    await post('c1', 1, entry('2026-10-05', 105));
    const { body } = await pull(cursor);
    expect(body.rows.map((r: any) => [r.client_id, r.version])).toEqual([['c2', 1], ['c1', 2]]);
    expect((await pull(body.cursor)).body.rows).toEqual([]);
  });

  it('includes tombstones', async () => {
    await post('c1', null, entry('2026-10-05'));
    await db.updateTable('log_entries').set({ deleted_at: new Date(), seq: '99' }).execute();
    const { body } = await pull();
    expect(body.rows[0].deleted_at).not.toBeNull();
    expect(body.cursor).toBe('99');
  });

  it('pages: each page continues from the last cursor until more is false', async () => {
    for (let i = 1; i <= 5; i++) await post(`c${i}`, null, entry('2026-10-05'));
    const seen: string[] = [];
    let cursor = '0';
    let pages = 0;
    for (;;) {
      const { body } = await pull(cursor, 'owner', '&limit=2');
      pages++;
      seen.push(...body.rows.map((r: any) => r.client_id));
      cursor = body.cursor;
      if (!body.more) break;
    }
    expect(pages).toBe(3);
    expect(seen).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
  });

  it('keeps rows that share a seq together on one page', async () => {
    for (let i = 1; i <= 3; i++) await post(`c${i}`, null, entry('2026-10-05'));
    await db.updateTable('log_entries').set({ seq: '1' }).where('client_id', 'in', ['c1', 'c2']).execute();
    const { body } = await pull(0, 'owner', '&limit=1');
    expect(body.rows.map((r: any) => r.client_id).sort()).toEqual(['c1', 'c2']);
    expect(body.more).toBe(true);
  });

  it("never returns another user's rows", async () => {
    await post('mine', null, entry('2026-10-05'));
    await post('theirs', null, entry('2026-10-05'), 'tester');
    expect((await pull(0, 'owner')).body.rows.map((r: any) => r.client_id)).toEqual(['mine']);
    expect((await pull(0, 'tester')).body.rows.map((r: any) => r.client_id)).toEqual(['theirs']);
  });

  it.each(['abc', '-1', '1.5', ''])('rejects since=%j with 400', async since => {
    expect((await pull(since)).status).toBe(400);
  });

  it.each(['0', '501', 'x'])('rejects limit=%s with 400', async limit => {
    expect((await pull(0, 'owner', `&limit=${limit}`)).status).toBe(400);
  });
});

describe('after a restart', () => {
  it('reads a posted session back through sync on a fresh server', async () => {
    const saved = (await post('c1', null, entry('2026-10-07'))).body.rows[0];
    await new Promise<void>(done => server.close(() => done()));
    ({ server, base } = await listen());
    const { body } = await pull();
    expect(body.rows.map((r: any) => [r.id, r.version])).toEqual([[saved.id, 1]]);
  });
});

// Build spec section 5: after a flush and a pull, the phone's rows equal the server's rows for that user.
describe('reconciliation invariant', () => {
  it('a phone applying every response and then pulling ends with exactly the server rows', async () => {
    const phone = new Map<string, any>();
    const apply = (rows: any[]) => rows.forEach(r => phone.set(r.client_id, r));
    // A flush: creates, a retry, an edit, a stale edit, an invalid write, a missing-row edit.
    apply((await post('a', null, entry('2026-10-05'))).body.rows);
    apply((await post('b', null, entry('2026-10-06'))).body.rows);
    apply((await post('a', null, entry('2026-10-05'))).body.rows);
    apply((await post('a', 1, entry('2026-10-05', 110))).body.rows);
    const stale = await post('a', 1, entry('2026-10-05', 120));
    expect(stale.status).toBe(409);
    apply([stale.body.current]);
    expect((await post('c', null, { d: 'nope' })).status).toBe(422);
    expect((await post('ghost', 3, entry('2026-10-05'))).status).toBe(409);
    await db.updateTable('log_entries').set({ deleted_at: new Date(), version: 2, seq: '50' }).where('client_id', '=', 'b').execute();

    // Pull in small pages from the start, as a phone with nothing local would.
    let cursor = '0';
    for (;;) {
      const { body } = await pull(cursor, 'owner', '&limit=1');
      apply(body.rows);
      cursor = body.cursor;
      if (!body.more) break;
    }

    const server = await db.selectFrom('log_entries').selectAll().orderBy('id').execute();
    const key = (r: any) => `${r.id}:${r.client_id}:${r.version}:${r.deleted_at ? 'deleted' : 'live'}`;
    expect([...phone.values()].map(key).sort()).toEqual(server.map(key).sort());
    expect(server.filter(r => r.auto && !r.deleted_at)).toHaveLength(0);
    const checkOffs = server.filter(r => r.auto && !r.deleted_at).map(r => `${r.exercise_id}|${r.slot}|${r.wk}`);
    expect(new Set(checkOffs).size).toBe(checkOffs.length);
  });
});
