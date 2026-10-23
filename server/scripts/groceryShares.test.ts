import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DB } from '../db/types.ts';
import { startTestDatabase } from '../test/postgres.ts';
import { readShares, shapeOf, summarize } from './groceryShares.ts';

const people = new Set(['sis', 'mom']);
describe('shapeOf', () => {
  it('names each stored shape in words', () => {
    expect(shapeOf(undefined, people)).toBe('none');
    expect(shapeOf({ with: [] }, people)).toBe('with 0');
    expect(shapeOf({ with: ['sis', 'mom'] }, people)).toBe('with 2');
    expect(shapeOf({ with: ['mom'], notMine: true }, people)).toBe('with 1 + notMine');
    expect(shapeOf({ with: ['gone'] }, people)).toBe('with 1 (1 not a known person)');
    expect(shapeOf({ nope: 1 }, people)).toBe('malformed');
  });
});
describe('summarize', () => {
  const groups = [{ id: 'g', n: 'Costco', people: [{ id: 'sis', n: 'Sister' }, { id: 'mom', n: 'Mom' }], stores: ['BJs'] }];
  const items = [{ id: 'a', n: 'Chicken', store: 'BJs' }, { id: 'b', n: 'Soap', store: 'Aldi', share: { with: [] } }, { id: 'c', n: 'Tea', store: 'Aldi', share: { with: ['mom'], notMine: true } }];
  const months = [{ month: '2026-10', data: { lines: { a: { share: { with: ['sis'] } }, b: { packShares: [{ with: [] }, null] }, zz: {} } } }];
  it('counts shapes and never carries a name, an id or an amount', () => {
    const r = summarize(groups, items, months);
    expect(r.groups).toEqual({ count: 1, peoplePerGroup: [2], storesPerGroup: [1] });
    expect(r.items).toEqual({ count: 3, byShare: { none: 1, 'with 0': 1, 'with 1 + notMine': 1 }, storesNotInAnyGroup: 1 });
    expect(r.months['2026-10']).toEqual({ lines: 3, byShare: { 'with 1': 1, none: 2 }, packShares: 1, linesForMissingItems: 1 });
    const text = JSON.stringify(r);
    for (const secret of ['Chicken', 'Soap', 'Tea', 'Costco', 'Sister', 'BJs', 'Aldi']) expect(text).not.toContain(secret);
  });
});

describe('readShares', () => {
  let db: Kysely<DB>; let stop: () => Promise<void>; let uid: string;
  beforeAll(async () => {
    ({ db, stop } = await startTestDatabase());
    await sql`insert into auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values ('g1', 'x', 'x@example.com', true, now(), now())`.execute(db);
    uid = String((await sql<{ id: string }>`insert into users (auth_user_id, plan, is_admin) values ('g1', 'free', false) returning id`.execute(db)).rows[0].id);
    const item = (cid: string, list: string, data: object) => sql`insert into list_items (user_id, client_id, seq, list, position, data) values (${uid}, ${cid}, nextval(pg_get_serial_sequence('list_items', 'id')), ${list}, 0, ${JSON.stringify(data)}::jsonb)`.execute(db);
    await item('i1', 'grocery_item', { id: 'i1', n: 'Soap', store: 'Aldi', share: { with: [] } });
    await item('g1', 'grocery_group', { id: 'g1', n: 'Run', people: [{ id: 'p1', n: 'P' }], stores: ['BJs'] });
    await sql`insert into grocery_months (user_id, seq, month, data) values (${uid}, 1, '2026-10', ${JSON.stringify({ lines: { i1: { share: { with: ['p1'] } } } })}::jsonb)`.execute(db);
  }, 120_000);
  afterAll(async () => { await stop?.(); });
  it('reads one account inside a read-only transaction and writes nothing', async () => {
    const r = await readShares(db, uid);
    expect(r.items.byShare).toEqual({ 'with 0': 1 });
    expect(r.months['2026-10'].byShare).toEqual({ 'with 1': 1 });
    await expect(db.transaction().execute(async trx => { await sql`set transaction read only`.execute(trx); await sql`update users set plan = 'paid'`.execute(trx); })).rejects.toThrow(/read-only/);
  });
});
