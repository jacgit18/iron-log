import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gunzipSync, gzipSync } from 'node:zlib';
import { sql, type Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { createDb } from './db/connection.ts';
import { MAX_BYTES, daysFor, dayIsNear, parseDay, prepareFile, shouldReplace } from './backups.ts';
import type { DB } from './db/types.ts';
import { startTestDatabase } from './test/postgres.ts';

// Server backup history (ADR 066): routes, the plan's window, the same-day shrink guard, caps, whose rows, and erase.
// `db` is the owner connection (sets up and inspects); `app` is the restricted role the API runs as, so row-level security is really in force.
let db: Kysely<DB>;
let app: Kysely<DB>;
let stop: () => Promise<void>;
let server: Server | undefined;
beforeAll(async () => { let appUrl: string; ({ db, stop, appUrl } = await startTestDatabase()); app = createDb(appUrl); }, 120_000);
afterAll(async () => { await app.destroy(); await stop?.(); });
afterEach(() => new Promise<void>(done => (server ? server.close(() => done()) : done())));
beforeEach(async () => { await sql`delete from backup_snapshots`.execute(db); await sql`delete from users`.execute(db); delete process.env.BACKUPS_OFF; });

const DAY_MS = 86_400_000;
const dayOf = (offset: number) => new Date(Math.floor(Date.now() / DAY_MS) * DAY_MS + offset * DAY_MS).toISOString().slice(0, 10);
const TODAY = dayOf(0);
const fileOf = (extra: Record<string, unknown> = {}) => JSON.stringify({ app: 'iron-log', format: 1, ...extra });

async function start(options: Parameters<typeof createApp>[0] = {}) {
  server = createApp({ db: app, admins: new Set(['dev:boss']), ...options }).listen(0);
  await new Promise(done => server!.once('listening', done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = (who: string, more: Record<string, string> = {}) => ({ 'x-dev-user': who, 'x-client-version': '1', ...more });
  const put = (who: string, day: string, body: string | Buffer = gzipSync(fileOf()), score = 20, more: Record<string, string> = {}) =>
    fetch(`${base}/api/backups/${day}`, { method: 'PUT', headers: headers(who, { 'content-type': 'application/octet-stream', 'x-backup-entries': String(score), 'x-backup-score': String(score), 'x-backup-encoding': 'gzip', ...more }), body: body as never });
  const list = (who: string) => fetch(`${base}/api/backups`, { headers: headers(who) });
  const get = (who: string, day: string) => fetch(`${base}/api/backups/${day}`, { headers: headers(who) });
  const ensure = (who: string) => fetch(`${base}/api/me`, { headers: headers(who) });
  return { base, headers, put, list, get, ensure };
}
const setPlan = (name: string, plan: string) => sql`update users set plan = ${plan} where auth_user_id = ${'dev:' + name}`.execute(db);
const idOf = async (name: string) => String((await sql<{ id: string }>`select id from users where auth_user_id = ${'dev:' + name}`.execute(db)).rows[0]!.id);
const count = async (name?: string) => Number((await sql<{ n: string }>`select count(*) as n from backup_snapshots ${name ? sql`where user_id = ${await idOf(name)}` : sql``}`.execute(db)).rows[0]!.n);
// Old days written as the owner, as if earlier uploads had happened.
async function seed(name: string, days: number) {
  const id = await idOf(name);
  for (let i = 1; i <= days; i++) await sql`insert into backup_snapshots (user_id, day, entries, score, size_bytes, data) values (${id}, ${dayOf(-i)}::date, 5, 30, 3, ${gzipSync(fileOf())})`.execute(db);
}

describe('helpers', () => {
  it('daysFor: free and beta 7, paid, lifetime, founder and admin 30', () => {
    for (const plan of ['beta', 'free', '', null, 'vip']) expect(daysFor(plan, false)).toBe(7);
    for (const plan of ['paid', 'lifetime', 'founder']) expect(daysFor(plan, false)).toBe(30);
    expect(daysFor('free', true)).toBe(30);
  });
  it('parseDay takes real calendar days only', () => {
    expect(parseDay('2026-10-22')).toBe('2026-10-22');
    for (const bad of ['2026-02-30', '2026-13-01', '26-10-22', '2026-10-2', 'today', '', 5, undefined]) expect(parseDay(bad)).toBeNull();
  });
  it('dayIsNear: within two days of the server day', () => {
    const now = Date.parse('2026-10-22T10:00:00Z');
    for (const d of ['2026-10-20', '2026-10-22', '2026-10-24']) expect(dayIsNear(d, now)).toBe(true);
    for (const d of ['2026-10-19', '2026-10-25', '2020-01-01']) expect(dayIsNear(d, now)).toBe(false);
  });
  it('shouldReplace: the shrink guard starts at 10 and needs half', () => {
    expect(shouldReplace(null, 0)).toBe(true);
    expect(shouldReplace(9, 0)).toBe(true);
    expect(shouldReplace(10, 4)).toBe(false);
    expect(shouldReplace(10, 5)).toBe(true);
    expect(shouldReplace(100, 49)).toBe(false);
  });
  it('prepareFile: gzip or plain JSON of an Iron Log export, nothing else', () => {
    expect(prepareFile(gzipSync(fileOf()), 'gzip').ok).toBe(true);
    const plain = prepareFile(Buffer.from(fileOf()), 'identity');
    expect(plain.ok && gunzipSync(plain.zipped).toString()).toBe(fileOf());
    for (const [body, enc] of [[Buffer.from('nope'), 'gzip'], [Buffer.from('{"app":"other"}'), 'identity'], [Buffer.from('[1]'), 'identity'], [Buffer.from('not json'), 'identity'], [gzipSync('null'), 'gzip']] as const) expect(prepareFile(body, enc).ok).toBe(false);
  });
});

describe('upload, list and fetch', () => {
  it("stores today's file, lists it, and gives back the same JSON", async () => {
    const c = await start();
    const body = fileOf({ logs: { squat: [1, 2] } });
    expect((await c.put('ann', TODAY, gzipSync(body))).status).toBe(200);
    const listed = (await (await c.list('ann')).json()) as { days: number; backups: { date: string; entries: number; score: number }[] };
    expect(listed.days).toBe(7);
    expect(listed.backups).toEqual([expect.objectContaining({ date: TODAY, entries: 20, score: 20 })]);
    const res = await c.get('ann', TODAY);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(body);
  });

  it('takes a plain (uncompressed) file and stores it gzipped', async () => {
    const c = await start();
    expect((await c.put('ann', TODAY, Buffer.from(fileOf()), 20, { 'x-backup-encoding': 'identity' })).status).toBe(200);
    const row = await sql<{ data: Buffer }>`select data from backup_snapshots`.execute(db);
    expect(gunzipSync(row.rows[0]!.data).toString()).toBe(fileOf());
  });

  it("replaces the same day's copy, but a much smaller one does not overwrite a fuller one", async () => {
    const c = await start();
    await c.put('ann', TODAY, gzipSync(fileOf({ n: 1 })), 40);
    expect(((await (await c.put('ann', TODAY, gzipSync(fileOf({ n: 2 })), 45)).json()) as { saved: boolean }).saved).toBe(true);
    const small = (await (await c.put('ann', TODAY, gzipSync(fileOf({ n: 3 })), 10)).json()) as { saved: boolean };
    expect(small.saved).toBe(false);
    expect(await (await c.get('ann', TODAY)).text()).toBe(fileOf({ n: 2 }));
    expect(((await (await c.put('ann', TODAY, gzipSync(fileOf({ n: 4 })), 22)).json()) as { saved: boolean }).saved).toBe(false); // half of 45 is 22.5, so 22 is still too small
    expect(((await (await c.put('ann', TODAY, gzipSync(fileOf({ n: 5 })), 23)).json()) as { saved: boolean }).saved).toBe(true);
  });

  it('a small stored copy (under 10) is replaced by anything', async () => {
    const c = await start();
    await c.put('ann', TODAY, gzipSync(fileOf({ n: 1 })), 5);
    expect(((await (await c.put('ann', TODAY, gzipSync(fileOf({ n: 2 })), 0)).json()) as { saved: boolean }).saved).toBe(true);
  });

  it('a day with nothing is a 404, a bad day is a 400', async () => {
    const c = await start();
    await c.ensure('ann');
    expect((await c.get('ann', dayOf(-1))).status).toBe(404);
    expect((await c.get('ann', '2026-02-30')).status).toBe(400);
  });
});

describe('retention follows the plan', () => {
  const cases = [['beta', 7], ['free', 7], ['paid', 30], ['lifetime', 30], ['founder', 30]] as const;
  it.each(cases)('%s keeps the newest %i days after an upload', async (plan, days) => {
    const c = await start();
    await c.ensure('ann'); await setPlan('ann', plan); await seed('ann', 34);
    expect((await c.put('ann', TODAY)).status).toBe(200);
    expect(await count('ann')).toBe(days);
    const listed = (await (await c.list('ann')).json()) as { days: number; backups: { date: string }[] };
    expect(listed.days).toBe(days);
    expect(listed.backups).toHaveLength(days);
    expect(listed.backups[0]!.date).toBe(TODAY);
    expect(listed.backups.at(-1)!.date).toBe(dayOf(-(days - 1)));
  });

  it('an admin keeps 30 whatever the plan', async () => {
    const c = await start();
    await c.ensure('boss'); await setPlan('boss', 'free'); await seed('boss', 34);
    await c.put('boss', TODAY);
    expect(await count('boss')).toBe(30);
  });

  it('a paid account that falls back to free sees 7 at once, cannot fetch an older day, and is pruned at the next upload', async () => {
    const c = await start();
    await c.ensure('ann'); await setPlan('ann', 'paid'); await seed('ann', 20);
    expect(((await (await c.list('ann')).json()) as { backups: unknown[] }).backups).toHaveLength(20);
    await setPlan('ann', 'free');
    expect(((await (await c.list('ann')).json()) as { backups: unknown[] }).backups).toHaveLength(7);
    expect((await c.get('ann', dayOf(-3))).status).toBe(200);
    expect((await c.get('ann', dayOf(-10))).status).toBe(404);
    expect(await count('ann')).toBe(20);
    await c.put('ann', TODAY);
    expect(await count('ann')).toBe(7);
  });
});

describe('whose copies', () => {
  it("one account cannot list or fetch another's, and an upload only ever touches its own row", async () => {
    const c = await start();
    await c.put('ann', TODAY, gzipSync(fileOf({ who: 'ann' })), 30);
    await c.put('bob', TODAY, gzipSync(fileOf({ who: 'bob' })), 30);
    expect(await count()).toBe(2);
    expect(await (await c.get('bob', TODAY)).text()).toBe(fileOf({ who: 'bob' }));
    expect(((await (await c.list('bob')).json()) as { backups: unknown[] }).backups).toHaveLength(1);
    await c.ensure('cy');
    expect(((await (await c.list('cy')).json()) as { backups: unknown[] }).backups).toEqual([]);
    expect((await c.get('cy', TODAY)).status).toBe(404);
  });

  it('a stranger gets 401', async () => {
    const c = await start();
    expect((await fetch(`${c.base}/api/backups`)).status).toBe(401);
    expect((await fetch(`${c.base}/api/backups/${TODAY}`, { method: 'PUT', headers: { 'x-client-version': '1' }, body: 'x' })).status).toBe(401);
  });

  it('Erase everything removes the account copies; Delete my account does too', async () => {
    const c = await start();
    await c.put('ann', TODAY); await c.put('bob', TODAY);
    const erase = await fetch(`${c.base}/api/account/erase-data`, { method: 'POST', headers: c.headers('ann', { 'content-type': 'application/json' }), body: JSON.stringify({ confirm: 'ERASE' }) });
    expect(erase.status).toBe(200);
    expect(await count('ann')).toBe(0);
    expect(await count('bob')).toBe(1);
    const del = await fetch(`${c.base}/api/account/delete`, { method: 'POST', headers: c.headers('bob', { 'content-type': 'application/json' }), body: JSON.stringify({ confirm: 'DELETE' }) });
    expect(del.status).toBe(200);
    expect(await count()).toBe(0);
  });
});

describe('bad input writes nothing', () => {
  it('an oversize body is 413', async () => {
    const c = await start();
    const res = await c.put('ann', TODAY, Buffer.alloc(MAX_BYTES + 1, 1));
    expect(res.status).toBe(413);
    expect(await count()).toBe(0);
  });
  it('plain JSON that compresses to over the cap is 413', async () => {
    const c = await start();
    // Random-looking text does not compress; 1.5 MB of it stays over the cap after gzip but is under the body limit only when sent plain, so it is refused by size.
    const noise = Array.from({ length: 200_000 }, (_, i) => (i * 2654435761 >>> 0).toString(36)).join('');
    const res = await c.put('ann', TODAY, Buffer.from(fileOf({ noise })), 20, { 'x-backup-encoding': 'identity' });
    expect([413]).toContain(res.status);
    expect(await count()).toBe(0);
  });
  it('a body that is not a data file is 422', async () => {
    const c = await start();
    expect((await c.put('ann', TODAY, Buffer.from('hello'))).status).toBe(422);
    expect((await c.put('ann', TODAY, gzipSync('{"app":"other"}'))).status).toBe(422);
    expect((await c.put('ann', TODAY, Buffer.alloc(0))).status).toBe(422);
    expect(await count()).toBe(0);
  });
  it('a bad day, a far-off day, or missing counts is 422', async () => {
    const c = await start();
    expect((await c.put('ann', '2026-02-30')).status).toBe(422);
    expect((await c.put('ann', dayOf(-30))).status).toBe(422);
    expect((await c.put('ann', TODAY, undefined, 20, { 'x-backup-score': 'many' })).status).toBe(422);
    expect((await c.put('ann', TODAY, undefined, 20, { 'x-backup-encoding': 'br' })).status).toBe(422);
    expect(await count()).toBe(0);
  });
  it('no client version is 426 when a minimum is set, and an old one too', async () => {
    const c = await start({ minClientVersion: 100 });
    const noVersion = await fetch(`${c.base}/api/backups`, { headers: { 'x-dev-user': 'ann' } });
    expect(noVersion.status).toBe(426);
    expect((await fetch(`${c.base}/api/backups`, { headers: { 'x-dev-user': 'ann', 'x-client-version': '99' } })).status).toBe(426);
    expect((await c.put('ann', TODAY)).status).toBe(426);
    expect(await count()).toBe(0);
  });
  it('an upload burst past the limit is 429', async () => {
    const c = await start({ limits: { backups: { max: 3, windowMs: 60_000 } } });
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await c.put('ann', TODAY)).status);
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
    expect(await count()).toBe(1);
  });
  it('BACKUPS_OFF=true answers 503 and writes nothing', async () => {
    const c = await start();
    process.env.BACKUPS_OFF = 'true';
    expect((await c.put('ann', TODAY)).status).toBe(503);
    expect((await c.list('ann')).status).toBe(503);
    expect(await count()).toBe(0);
  });
});
