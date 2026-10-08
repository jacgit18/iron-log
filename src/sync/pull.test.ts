import { describe, expect, it } from 'vitest';
import { createMirrorStore } from './mirrorStore.js';
import { pullAll } from './pull.js';
import { logServerRow, memoryStorage, serverRow } from './testing.js';
import type { PullOutcome } from './transport.js';

type Page = Extract<PullOutcome, { ok: true }>;
const page = (rows: object[], cursor: string, more: boolean): PullOutcome => ({ ok: true, rows: rows as Page['rows'], cursor, more });
const failure = (cls: 'network' | 'server' | 'auth' | 'outdated', status = 0, retryAfterMs: number | null = null): PullOutcome => ({ ok: false, class: cls, status, retryAfterMs, message: `${cls} failure` });

// A transport that answers the scripted outcomes in order and records what it was asked.
function scripted(outcomes: PullOutcome[]) {
  const asked: { since: string; limit?: number }[] = [];
  let i = 0;
  return { asked, pull: async (since: string, limit?: number) => { asked.push({ since, limit }); return outcomes[i++] ?? failure('server', 500); } };
}
const L = (id: string, seq: string, over: object = {}) => ({ table: 'log_entries', ...(logServerRow(id, { seq }) as object), ...over });

describe('pullAll', () => {
  it('fills the mirror from the cursor to the end, page by page, and says which documents changed', async () => {
    const store = createMirrorStore(memoryStorage());
    const t = scripted([
      page([L('L1', '1'), L('L2', '2')], '2', true),
      page([{ table: 'weeks', ...(serverRow({ week_start: '2026-10-04', data: { prog: 'A' } }, { seq: '3' }) as object) }], '3', false),
    ]);
    const out = await pullAll(t, store, 2);
    expect(out).toMatchObject({ ok: true, pages: 2, rows: 3 });
    expect(out.ok && out.paths.sort()).toEqual(['logs/squat', 'weeks/2026-10-04']);
    expect(t.asked).toEqual([{ since: '0', limit: 2 }, { since: '2', limit: 2 }]);
    expect(store.cursor()).toBe('3');
    expect(store.rows().size).toBe(3);
  });

  it('an empty answer is a successful pull that changed nothing', async () => {
    const store = createMirrorStore(memoryStorage());
    const out = await pullAll(scripted([page([], '0', false)]), store);
    expect(out).toEqual({ ok: true, pages: 1, rows: 0, paths: [] });
  });

  it('pulling the same rows again changes nothing', async () => {
    const store = createMirrorStore(memoryStorage());
    await pullAll(scripted([page([L('L1', '1')], '1', false)]), store);
    const again = await pullAll(scripted([page([L('L1', '1')], '1', false)]), store);
    expect(again).toMatchObject({ ok: true, paths: [] });
  });

  it('a pull that stops halfway keeps the pages it got and resumes from there', async () => {
    const storage = memoryStorage();
    const first = createMirrorStore(storage);
    const out = await pullAll(scripted([page([L('L1', '1')], '1', true), failure('network')]), first);
    expect(out).toMatchObject({ ok: false, class: 'network', pages: 1, rows: 1, paths: ['logs/squat'] });
    // the browser is reloaded
    const second = createMirrorStore(storage);
    expect(second.cursor()).toBe('1');
    const t = scripted([page([L('L2', '2')], '2', false)]);
    expect(await pullAll(t, second)).toMatchObject({ ok: true, rows: 1 });
    expect(t.asked[0]!.since).toBe('1');
    expect(second.rows().size).toBe(2);
  });

  it.each([['network', 0], ['server', 503], ['auth', 401], ['outdated', 426]] as const)('a %s failure stops the pull and passes the class on', async (cls, status) => {
    const store = createMirrorStore(memoryStorage());
    const out = await pullAll(scripted([failure(cls, status, 7000)]), store);
    expect(out).toMatchObject({ ok: false, class: cls, retryAfterMs: 7000, pages: 0, rows: 0 });
    expect(store.cursor()).toBe('0');
  });

  it('applies tombstones, so a delete on another device reaches this one', async () => {
    const store = createMirrorStore(memoryStorage());
    await pullAll(scripted([page([L('L1', '1')], '1', false)]), store);
    const out = await pullAll(scripted([page([{ table: 'log_entries', ...(logServerRow('L1', { version: 2, seq: '2', deleted_at: '2026-10-07T13:00:00.000Z' }) as object) }], '2', false)]), store);
    expect(out).toMatchObject({ ok: true, paths: ['logs/squat'] });
    expect(store.rows().get('log_entries|L1')).toMatchObject({ deleted: true, version: 2 });
  });

  describe('a server that misbehaves', () => {
    it('a table this version does not know stops the pull without moving the cursor, so nothing is skipped', async () => {
      const store = createMirrorStore(memoryStorage());
      const out = await pullAll(scripted([page([L('L1', '1'), { table: 'habits', id: '1', version: 1, seq: '2', deleted_at: null }], '2', false)]), store);
      expect(out).toMatchObject({ ok: false, class: 'outdated' });
      expect(store.cursor()).toBe('0');
      expect(store.rows().size).toBe(0);
    });

    it('a page that says there is more but does not move the cursor would loop, so it stops', async () => {
      const store = createMirrorStore(memoryStorage());
      const out = await pullAll(scripted([page([], '0', true)]), store);
      expect(out).toMatchObject({ ok: false, class: 'server', message: 'the server did not advance the cursor' });
    });

    it('a cursor behind ours is refused', async () => {
      const store = createMirrorStore(memoryStorage());
      store.applyPage({}, '9');
      expect(await pullAll(scripted([page([], '3', false)]), store)).toMatchObject({ ok: false, class: 'server', message: 'the server sent a cursor behind ours' });
      expect(store.cursor()).toBe('9');
    });

    it('a cursor that is not a number is refused rather than thrown on', async () => {
      const store = createMirrorStore(memoryStorage());
      expect(await pullAll(scripted([page([], 'abc', false)]), store)).toMatchObject({ ok: false, class: 'server' });
    });
  });
});
