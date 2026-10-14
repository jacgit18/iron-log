import { describe, expect, it } from 'vitest';
import { desiredRows, parsePath, type PathKind } from './documents.js';
import { ownChanges } from './ownChanges.js';
import { mirrorId, type Mirror, type MirrorRow } from './types.js';

const kind = (path: string) => parsePath(path) as PathKind;
// The server rows a document stands for, as this device's copy held them before the erase.
const mirrorOf = (path: string, doc: unknown): Mirror =>
  new Map(desiredRows(kind(path), doc, new Map()).map(r => [mirrorId(r.table, r.key), { ...r, version: 1, deleted: false, seq: '1' } as MirrorRow]));
const session = (id: string, w: number, d = '2026-10-05') => ({ id, d, ph: 'strength', w, s: 3, r: 5 });
const logs = (...entries: object[]) => ({ schema: 1, entries });
const wk = (done: object, extra: object = {}) => ({ prog: 'A', done, skipped: {}, moved: {}, ph: {}, warm: {}, ...extra });

describe('ownChanges', () => {
  it('keeps the sessions this device added or changed, not the ones it only carried', () => {
    const before = mirrorOf('logs/squat', logs(session('old1', 100), session('old2', 110)));
    const own = ownChanges(kind('logs/squat'), logs(session('old1', 100), session('old2', 115), session('new1', 120, '2026-10-12')), before) as { entries: { id: string; w: number }[] };
    expect(own.entries.map(e => [e.id, e.w])).toEqual([['old2', 115], ['new1', 120]]);
  });

  it('is null when the device changed nothing, removed something, or the document is a delete', () => {
    const before = mirrorOf('logs/squat', logs(session('old1', 100), session('old2', 110)));
    expect(ownChanges(kind('logs/squat'), logs(session('old1', 100), session('old2', 110)), before)).toBeNull();
    expect(ownChanges(kind('logs/squat'), logs(session('old1', 100)), before)).toBeNull(); // removed: nothing left to remove
    expect(ownChanges(kind('logs/squat'), { __delete: true }, before)).toBeNull();
  });

  it('keeps everything in a document the device had no copy of', () => {
    const own = ownChanges(kind('logs/bench'), logs(session('b1', 80)), new Map()) as { entries: { id: string }[] };
    expect(own.entries.map(e => e.id)).toEqual(['b1']);
  });

  it('the week keys kept go with the program and layout they were ticked against', () => {
    const ran = { prog: 'B', program: { days: [] } };
    const before = mirrorOf('weeks/2026-10-11', wk({ a: true }, { prog: 'B', ran, order: [2, 1] }));
    const own = ownChanges(kind('weeks/2026-10-11'), wk({ a: true, c: true }, { prog: 'B', ran, order: [2, 1] }), before) as { done: object; prog: string; ran: unknown; order: unknown };
    expect(own.done).toEqual({ c: true });
    expect(own.prog).toBe('B'); // not the empty week's null
    expect(own.ran).toEqual(ran);
    expect(own.order).toEqual([2, 1]);
  });

  it('keeps only the week keys this device changed', () => {
    const before = mirrorOf('weeks/2026-10-11', wk({ a: true, b: true }));
    const own = ownChanges(kind('weeks/2026-10-11'), wk({ a: true, b: true, c: true }), before) as { done: object };
    expect(own.done).toEqual({ c: true });
    expect(ownChanges(kind('weeks/2026-10-11'), wk({ a: true, b: true }), before)).toBeNull();
  });
});

describe('ownChanges: a grocery month (ADR 039)', () => {
  it('keeps only the lines and fields this device changed', () => {
    const before = mirrorOf('grocery/2026-10', { lines: { kale: { got: true }, rice: { got: true, cents: 100 } }, pulled: [] });
    const own = ownChanges(kind('grocery/2026-10'), { lines: { kale: { got: true }, rice: { got: true, cents: 150 }, salt: { got: true } }, pulled: [] }, before);
    expect(own).toEqual({ lines: { rice: { cents: 150 }, salt: { got: true } }, pulled: [] });
  });
  it('is null when the month is as it was', () => {
    const doc = { lines: { kale: { got: true } }, pulled: [] };
    expect(ownChanges(kind('grocery/2026-10'), doc, mirrorOf('grocery/2026-10', doc))).toBeNull();
  });
});
