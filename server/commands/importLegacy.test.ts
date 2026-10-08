import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql, type Kysely } from 'kysely';
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

async function send(path: string, body: unknown, user = 'owner') {
  const res = await fetch(`${base}/api/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-user': user, 'x-client-version': 'test-1' }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as any };
}
const importAll = (commands: object[], user = 'owner') => send('commands/import-legacy', { clientId: 'import-1', baseVersion: null, input: { commands } }, user);

const WS = '2026-10-04';
const program = { days: Array.from({ length: 6 }, (_, i) => ({ title: `Day ${i + 1}`, slots: [{ id: `A-d${i + 1}s1`, items: [{ ex: 'squat', ph: 'strength', w: 135 }] }] })) };
const session = (clientId: string, exerciseId = 'squat', over: object = {}) => ({ name: 'log-session', clientId, input: { exerciseId, entry: { d: '2026-10-05', ph: 'strength', w: 135, s: 3, r: 5, ...over } } });
const everything = () => [
  session('k1abc'),
  session('e2', 'deadlift', { w: 225 }),
  { name: 'tick-card', clientId: 't1', input: { exerciseId: 'squat', entry: { d: '2026-10-07', ph: 'strength', w: 135, s: 3, r: 5, slot: 'A-d1s1', wk: WS, auto: true } } },
  { name: 'log-body-weight', clientId: 'b1', input: { wk: WS, d: '2026-10-07', w: 180.5 } },
  { name: 'save-week', clientId: 'w1', input: { weekStart: WS, week: { prog: 'A', done: {}, skipped: {}, moved: {}, ph: {}, warm: {} } } },
  { name: 'save-stretch-week', clientId: 's1', input: { weekStart: WS, week: { done: {}, skipped: {}, extra: [] } } },
  { name: 'save-supplement-day', clientId: 'd1', input: { day: '2026-10-07', water: [16, 8], boost: { hot: true, mins: 45 }, taken: { creatine: true } } },
  { name: 'save-program', clientId: 'p1', input: { key: 'A', program } },
  { name: 'save-config', clientId: 'c1', input: { config: { mode: 2, rest: 90 } } },
  { name: 'save-library-item', clientId: 'l1', input: { item: { id: 'v1', name: 'My cut', from: 'A', at: '2026-10-07T12:00:00Z', prog: program } } },
  { name: 'save-list-item', clientId: 'x1', input: { list: 'stretch', item: { id: 's1', n: 'One' }, position: 0 } },
];
const counts = async () => {
  const n = async (t: string) => Number((await sql<{ n: string }>`select count(*)::text as n from ${sql.table(t)}`.execute(db)).rows[0]!.n);
  return { log: await n('log_entries'), body: await n('body_entries'), weeks: await n('weeks'), stretch: await n('stretch_weeks'), supp: await n('supplement_days'), programs: await n('programs'), config: await n('config'), library: await n('library_items'), lists: await n('list_items') };
};

describe('import-legacy', () => {
  it('loads every kind of row for an empty account, in one go, keeping the legacy ids', async () => {
    const res = await importAll(everything());
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ total: 11, imported: { 'log-session': 2, 'tick-card': 1, 'log-body-weight': 1, 'save-week': 1, 'save-stretch-week': 1, 'save-supplement-day': 1, 'save-program': 1, 'save-config': 1, 'save-library-item': 1, 'save-list-item': 1 } });
    expect(await counts()).toEqual({ log: 3, body: 1, weeks: 1, stretch: 1, supp: 1, programs: 1, config: 1, library: 1, lists: 1 });
    const ids = (await db.selectFrom('log_entries').select('client_id').execute()).map(r => r.client_id).sort();
    expect(ids).toEqual(['e2', 'k1abc', 't1']);
    // and the pull feed delivers all of it to the phone
    const pulled = await (await fetch(`${base}/api/sync?since=0&limit=500`, { headers: { 'x-dev-user': 'owner', 'x-client-version': 'test-1' } })).json() as { rows: unknown[] };
    expect(pulled.rows).toHaveLength(11);
  });

  it('is refused for an account that already has any row, and changes nothing', async () => {
    await send('commands/log-body-weight', { clientId: 'b0', baseVersion: null, input: { wk: WS, d: '2026-10-01', w: 170 } });
    const before = await counts();
    const res = await importAll(everything());
    expect(res).toMatchObject({ status: 409, body: { refused: 'account-not-empty' } });
    expect(await counts()).toEqual(before);
  });

  it('a second run is refused, so a second device cannot stamp old data over new', async () => {
    expect((await importAll(everything())).status).toBe(201);
    const again = await importAll(everything());
    expect(again).toMatchObject({ status: 409, body: { refused: 'account-not-empty' } });
    expect((await counts()).log).toBe(3);
  });

  it('an account whose only rows were deleted is still not empty', async () => {
    await send('commands/log-session', { clientId: 'g1', baseVersion: null, input: { exerciseId: 'squat', entry: { d: '2026-10-05', w: 135 } } });
    await send('commands/delete-entry', { clientId: 'g1d', baseVersion: 1, input: { entryId: 'g1' } });
    expect((await importAll(everything())).status).toBe(409);
  });

  it('two entries with the same id stop the import and roll everything back', async () => {
    const res = await importAll([session('same', 'dip'), { name: 'log-body-weight', clientId: 'b1', input: { wk: WS, d: '2026-10-07', w: 180.5 } }, session('same', 'kneeraise')]);
    expect(res).toMatchObject({ status: 422, body: { refused: 'duplicate-id', at: 2, command: 'log-session' } });
    expect(await counts()).toEqual({ log: 0, body: 0, weeks: 0, stretch: 0, supp: 0, programs: 0, config: 0, library: 0, lists: 0 });
    expect((await importAll([session('same', 'dip'), session('same-2', 'kneeraise')])).status).toBe(201); // the phone's fix, a suffix, works
  });

  it('one invalid row stops the import and rolls everything back; only where it stopped is recorded', async () => {
    const bad = { name: 'log-body-weight', clientId: 'b9', input: { wk: 'not-a-week', d: '2026-10-07', w: 'heavy' } };
    const res = await importAll([session('e1'), bad, session('e3')]);
    expect(res).toMatchObject({ status: 422, body: { refused: 'invalid-input', at: 1, command: 'log-body-weight' } });
    expect(await counts()).toMatchObject({ log: 0, body: 0 });
    const refused = await db.selectFrom('refused_writes').selectAll().where('command', '=', 'import-legacy').execute();
    expect(refused).toHaveLength(1);
    expect(refused[0]!.reason).toBe('log-body-weight: invalid-input');
    expect(JSON.stringify(refused[0]!.payload)).not.toContain('heavy');
  });

  it('refuses a command it does not know, a delete, an empty list and a malformed body', async () => {
    for (const commands of [[{ name: 'delete-entry', clientId: 'x', input: { entryId: 'a' } }], [{ name: 'drop-everything', clientId: 'x', input: {} }], [], [{ name: 'log-session' }], [null]]) {
      expect((await importAll(commands as object[])).status).toBe(422);
    }
    expect((await send('commands/import-legacy', { nope: true })).status).toBe(422);
    expect(await counts()).toMatchObject({ log: 0 });
  });

  it('one user\'s import never touches another\'s rows', async () => {
    expect((await importAll([session('a1')], 'ann')).status).toBe(201);
    expect((await importAll([session('a1')], 'bob')).status).toBe(201); // client ids are per user
    expect((await counts()).log).toBe(2);
  });

  it('accepts a body bigger than the 100 kb every other command is held to', async () => {
    const many = Array.from({ length: 1500 }, (_, i) => session(`big${i}`, 'squat', { d: '2026-10-05', n: 'x'.repeat(80), w: 100 + (i % 50) }));
    expect(JSON.stringify(many).length).toBeGreaterThan(150_000);
    const res = await importAll(many);
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(1500);
  });
});
