import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gunzipSync, gzipSync } from 'node:zlib';
import { sql, type Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { createDb } from './db/connection.ts';
import { KEEP_DAYS, MAX_BYTES, dayIsNear, deviceOf, parseDay, prepareFile, shouldReplace } from './backups.ts';
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

const plans = new Set(['pat']); // the user the plan tests set up by hand
async function start(options: Parameters<typeof createApp>[0] = {}) {
  server = createApp({ db: app, admins: new Set(['dev:boss']), ...options }).listen(0);
  await new Promise(done => server!.once('listening', done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = (who: string, more: Record<string, string> = {}) => ({ 'x-dev-user': who, 'x-client-version': '1', ...more });
  // Every test user is a paid account the first time they are seen, unless the test sets the plan itself (`plans` names who to leave alone).
  const seen = new Set<string>();
  const paid = async (who: string) => { if (seen.has(who) || who === 'boss' || plans.has(who)) return; seen.add(who); await fetch(`${base}/api/me`, { headers: headers(who) }); await setPlan(who, 'paid'); };
  const put0 = (who: string, day: string, body: string | Buffer = gzipSync(fileOf()), score = 20, more: Record<string, string> = {}) =>
    fetch(`${base}/api/backups/${day}`, { method: 'PUT', headers: headers(who, { 'content-type': 'application/octet-stream', 'x-backup-entries': String(score), 'x-backup-score': String(score), 'x-backup-encoding': 'gzip', ...more }), body: body as never });
  const list0 = (who: string) => fetch(`${base}/api/backups`, { headers: headers(who) });
  const get0 = (who: string, day: string) => fetch(`${base}/api/backups/${day}`, { headers: headers(who) });
  const ensure = (who: string) => fetch(`${base}/api/me`, { headers: headers(who) });
  const put: typeof put0 = async (who, ...rest) => { await paid(who); return put0(who, ...rest); };
  const list: typeof list0 = async who => { await paid(who); return list0(who); };
  const get: typeof get0 = async (who, day) => { await paid(who); return get0(who, day); };
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
  it('prepareFile: gzip or plain JSON of a Loadbearer export, nothing else', () => {
    expect(prepareFile(gzipSync(fileOf()), 'gzip').ok).toBe(true);
    const plain = prepareFile(Buffer.from(fileOf()), 'identity');
    expect(plain.ok && gunzipSync(plain.zipped).toString()).toBe(fileOf());
    for (const [body, enc] of [[Buffer.from('nope'), 'gzip'], [Buffer.from('{"app":"other"}'), 'identity'], [Buffer.from('[1]'), 'identity'], [Buffer.from('not json'), 'identity'], [gzipSync('null'), 'gzip']] as const) expect(prepareFile(body, enc).ok).toBe(false);
  });
});

describe('device names', () => {
  it('deviceOf takes 1 to 40 printable characters, percent-encoded, and nothing else', () => {
    expect(deviceOf(encodeURIComponent('iPhone'))).toBe('iPhone');
    expect(deviceOf(encodeURIComponent('  Josh’s Mac  '))).toBe('Josh’s Mac');
    for (const bad of [undefined, '', '   ', 'x'.repeat(41), '%00', '%0A', 'bad%', encodeURIComponent('a\u0007b')]) expect(deviceOf(bad)).toBeNull();
    expect(deviceOf('x'.repeat(40))).toBe('x'.repeat(40));
  });
  it('stores the name with the copy, returns it in the list, and a later device replaces it', async () => {
    const c = await start();
    expect((await c.put('ann', TODAY, undefined, 20, { 'x-backup-device': encodeURIComponent('iPhone') })).status).toBe(200);
    let listed = (await (await c.list('ann')).json()) as { backups: { date: string; device?: string }[] };
    expect(listed.backups).toEqual([expect.objectContaining({ date: TODAY, device: 'iPhone' })]);
    await c.put('ann', TODAY, undefined, 20, { 'x-backup-device': encodeURIComponent('Windows PC') });
    listed = (await (await c.list('ann')).json()) as { backups: { date: string; device?: string }[] };
    expect(listed.backups[0].device).toBe('Windows PC');
  });
  it('keeps the earlier name when a much smaller copy from another device is refused by the shrink guard', async () => {
    const c = await start();
    await c.put('ann', TODAY, undefined, 40, { 'x-backup-device': encodeURIComponent('iPhone') });
    await c.put('ann', TODAY, undefined, 5, { 'x-backup-device': encodeURIComponent('Windows PC') });
    const listed = (await (await c.list('ann')).json()) as { backups: { device?: string }[] };
    expect(listed.backups[0].device).toBe('iPhone');
  });
  it('saves the copy without a name when the header is missing or malformed', async () => {
    const c = await start();
    expect((await c.put('ann', TODAY, undefined, 20, { 'x-backup-device': '%00' })).status).toBe(200);
    const listed = (await (await c.list('ann')).json()) as { backups: { device?: string }[] };
    expect(listed.backups).toHaveLength(1);
    expect(listed.backups[0].device).toBeUndefined();
  });
});

describe('upload, list and fetch', () => {
  it("stores today's file, lists it, and gives back the same JSON", async () => {
    const c = await start();
    const body = fileOf({ logs: { squat: [1, 2] } });
    expect((await c.put('ann', TODAY, gzipSync(body))).status).toBe(200);
    const listed = (await (await c.list('ann')).json()) as { days: number; backups: { date: string; entries: number; score: number }[] };
    expect(listed.days).toBe(30);
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

describe('paid and admin accounts only', () => {
  it.each(['beta', 'free'])('a %s account gets 402 on every route and nothing is written', async plan => {
    const c = await start();
    await c.ensure('pat'); await setPlan('pat', plan);
    expect((await c.put('pat', TODAY)).status).toBe(402);
    expect((await c.list('pat')).status).toBe(402);
    expect((await c.get('pat', TODAY)).status).toBe(402);
    expect(await count()).toBe(0);
  });

  it.each(['paid', 'lifetime', 'founder'])('a %s account keeps the newest 30 days after an upload', async plan => {
    const c = await start();
    await c.ensure('pat'); await setPlan('pat', plan); await seed('pat', 34);
    expect((await c.put('pat', TODAY)).status).toBe(200);
    expect(await count('pat')).toBe(KEEP_DAYS);
    const listed = (await (await c.list('pat')).json()) as { days: number; backups: { date: string }[] };
    expect(listed.days).toBe(30);
    expect(listed.backups).toHaveLength(30);
    expect(listed.backups[0]!.date).toBe(TODAY);
    expect(listed.backups.at(-1)!.date).toBe(dayOf(-29));
  });

  it('an admin is allowed whatever the plan', async () => {
    const c = await start();
    await c.ensure('boss'); await setPlan('boss', 'free'); await seed('boss', 34);
    expect((await c.put('boss', TODAY)).status).toBe(200);
    expect(await count('boss')).toBe(30);
  });

  it('a paid account that falls back to free is locked out at once; its stored days stay until it is paid again', async () => {
    const c = await start();
    await c.ensure('pat'); await setPlan('pat', 'paid'); await seed('pat', 5);
    expect(((await (await c.list('pat')).json()) as { backups: unknown[] }).backups).toHaveLength(5);
    await setPlan('pat', 'free');
    expect((await c.list('pat')).status).toBe(402);
    expect((await c.get('pat', dayOf(-3))).status).toBe(402);
    expect(await count('pat')).toBe(5);
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

  it("a page for another account is refused with 409 and writes and reads nothing", async () => {
    const c = await start();
    await c.put('ann', TODAY);
    const bobId = await (async () => { await c.put('bob', TODAY); return idOf('bob'); })();
    const wrong = { 'content-type': 'application/octet-stream', 'x-backup-entries': '20', 'x-backup-score': '20', 'x-backup-encoding': 'gzip', 'x-expected-user': bobId };
    const put = await fetch(`${c.base}/api/backups/${TODAY}`, { method: 'PUT', headers: c.headers('ann', wrong), body: gzipSync(fileOf({ stray: true })) as never });
    expect(put.status).toBe(409);
    expect((await fetch(`${c.base}/api/backups`, { headers: c.headers('ann', { 'x-expected-user': bobId }) })).status).toBe(409);
    expect(await (await c.get('ann', TODAY)).text()).toBe(fileOf());
    expect(await count('ann')).toBe(1);
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
