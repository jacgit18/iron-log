import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { USAGE_EVENTS, USAGE_MAX_COUNT, type UsageReport } from '../shared/usage.js';
import { addCount, buildReport, cleanCounts, countUsage, eventsBetween, flushUsage, setUsage, startUsage, subtractCounts, usageDue, usageOn, utcDay, type SendResult } from './usage.js';

const memory = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
let store: ReturnType<typeof memory>;
beforeEach(() => { store = memory(); vi.stubGlobal('localStorage', store); });
afterEach(() => vi.unstubAllGlobals());

const raw = (k: string) => (store.m.has('ironlog:' + k) ? JSON.parse(store.m.get('ironlog:' + k)!) : undefined);
const DAY = Date.UTC(2026, 9, 28, 12);
const sender = (result: SendResult = 'ok') => { const sent: UsageReport[] = []; return { sent, send: async (r: UsageReport) => { sent.push(r); return result; } }; };
const deps = (send: ReturnType<typeof sender>['send'], now = DAY) => ({ send, version: '10', fromApp: false, now: () => now });

describe('counts', () => {
  it('adds one and stops at the cap', () => {
    expect(addCount({}, 'app_open')).toEqual({ app_open: 1 });
    expect(addCount({ app_open: USAGE_MAX_COUNT }, 'app_open')).toEqual({ app_open: USAGE_MAX_COUNT });
  });
  it('reads storage defensively: only the six names, whole numbers', () => {
    expect(cleanCounts({ app_open: 2, sneaky: 5, export_used: -1, push_on: 1.5, sync_on: '3', workout_logged: 99999 })).toEqual({ app_open: 2, workout_logged: USAGE_MAX_COUNT });
    for (const bad of [null, 'x', [], 4]) expect(cleanCounts(bad)).toEqual({});
  });
  it('keeps what was counted while a send was in flight', () => {
    expect(subtractCounts({ app_open: 3, export_used: 1 }, { app_open: 2, export_used: 1 })).toEqual({ app_open: 1 });
  });
  it('knows a UTC day and when a send is due', () => {
    expect(utcDay(DAY)).toBe('2026-10-28');
    expect(usageDue(undefined, DAY)).toBe(true);
    expect(usageDue('2026-10-27', DAY)).toBe(true);
    expect(usageDue('2026-10-28', DAY)).toBe(false);
  });
  it('builds a report with exactly four fields', () => {
    expect(Object.keys(buildReport('i', '1', true, {})).sort()).toEqual(['counts', 'fromApp', 'id', 'version']);
  });
});

describe('the switch', () => {
  it('is off by default and keeps and sends nothing', async () => {
    const s = sender();
    countUsage('app_open');
    await flushUsage(deps(s.send));
    expect(usageOn()).toBe(false);
    expect(s.sent).toEqual([]);
    expect([...store.m.keys()]).toEqual([]);
  });

  it('on makes an id and zero counts, off forgets all of it', () => {
    setUsage(true, () => 'id-1');
    expect(usageOn()).toBe(true);
    expect(raw('usage:id')).toBe('id-1');
    countUsage('workout_logged');
    expect(raw('usage:counts')).toEqual({ workout_logged: 1 });
    setUsage(false);
    expect(usageOn()).toBe(false);
    expect([...store.m.keys()]).toEqual([]);
    setUsage(true, () => 'id-2');
    expect(raw('usage:id')).toBe('id-2'); // a new id, not the old one
    expect(raw('usage:counts')).toEqual({});
  });
});

describe('flushUsage', () => {
  it('sends once per UTC day, only the id, build, app flag and counts, then starts the counts again', async () => {
    setUsage(true, () => 'id-1');
    countUsage('app_open'); countUsage('app_open'); countUsage('export_used');
    const s = sender();
    await flushUsage(deps(s.send));
    expect(s.sent).toEqual([{ id: 'id-1', version: '10', fromApp: false, counts: { app_open: 2, export_used: 1 } }]);
    expect(raw('usage:counts')).toEqual({});
    expect(raw('usage:sent')).toBe('2026-10-28');
    countUsage('app_open');
    await flushUsage(deps(s.send)); // same day: nothing more goes
    expect(s.sent).toHaveLength(1);
    await flushUsage(deps(s.send, DAY + 24 * 3600_000)); // next day: the count since goes
    expect(s.sent).toHaveLength(2);
    expect(s.sent[1]!.counts).toEqual({ app_open: 1 });
  });

  it('keeps the counts and tries again at the next open when the send fails or throws', async () => {
    setUsage(true, () => 'id-1');
    countUsage('app_open');
    await flushUsage(deps(sender('retry').send));
    await flushUsage(deps(async () => { throw new Error('offline'); }));
    expect(raw('usage:counts')).toEqual({ app_open: 1 });
    expect(raw('usage:sent')).toBeUndefined();
    const s = sender();
    await flushUsage(deps(s.send));
    expect(s.sent).toHaveLength(1);
  });

  it('drops the counts when the server will never take them, so it does not loop', async () => {
    setUsage(true, () => 'id-1');
    countUsage('app_open');
    await flushUsage(deps(sender('drop').send));
    expect(raw('usage:counts')).toEqual({});
    expect(raw('usage:sent')).toBe('2026-10-28');
  });

  it('does not write anything back if the switch was turned off while the request was in flight', async () => {
    setUsage(true, () => 'id-1');
    countUsage('app_open');
    await flushUsage(deps(async () => { setUsage(false); return 'ok'; }));
    expect([...store.m.keys()]).toEqual([]);
  });

  it('keeps what was counted during the request', async () => {
    setUsage(true, () => 'id-1');
    countUsage('app_open');
    await flushUsage(deps(async () => { countUsage('export_used'); return 'ok'; }));
    expect(raw('usage:counts')).toEqual({ export_used: 1 });
  });
});

describe('eventsBetween', () => {
  const base = { exporting: null, logs: {}, programs: {}, sync: null } as Parameters<typeof eventsBetween>[0];
  const entry = { d: '2026-10-28' } as never;
  it('counts a new log entry but not a removed one or the same logs', () => {
    expect(eventsBetween(base, { ...base, logs: { a: [entry] } })).toEqual(['workout_logged']);
    expect(eventsBetween({ ...base, logs: { a: [entry] } }, { ...base, logs: { a: [] } })).toEqual([]);
    expect(eventsBetween(base, base)).toEqual([]);
  });
  it('counts a changed program, sync turned on and an export starting', () => {
    expect(eventsBetween(base, { ...base, programs: { A: {} as never } })).toEqual(['program_edited']);
    expect(eventsBetween(base, { ...base, sync: { state: 'ok' } as never })).toEqual(['sync_on']);
    expect(eventsBetween({ ...base, sync: { state: 'ok' } as never }, { ...base, sync: { state: 'busy' } as never })).toEqual([]);
    expect(eventsBetween(base, { ...base, exporting: 'csv' })).toEqual(['export_used']);
    expect(eventsBetween({ ...base, exporting: 'csv' }, base)).toEqual([]);
  });
  it('only ever names counters on the shared list', () => {
    const all = eventsBetween(base, { exporting: 'csv', logs: { a: [entry] }, programs: { A: {} as never }, sync: {} as never });
    for (const e of all) expect(USAGE_EVENTS).toContain(e);
  });
});

describe('startUsage', () => {
  it('counts the open and flushes when on; does nothing when off', async () => {
    const fake = (state: object) => ({ getState: () => state as never, subscribe: () => () => undefined });
    const s = sender();
    startUsage(fake({ isReady: () => true }), deps(s.send));
    await Promise.resolve();
    expect(s.sent).toEqual([]);
    setUsage(true, () => 'id-1');
    startUsage(fake({ isReady: () => true }), deps(s.send));
    await vi.waitFor(() => expect(s.sent).toHaveLength(1));
    expect(s.sent[0]!.counts).toEqual({ app_open: 1 });
  });

  it('counts store changes after the store is ready, never the first state', () => {
    setUsage(true, () => 'id-1');
    let listener: (s: object) => void = () => undefined;
    const api = { getState: () => ({}) as never, subscribe: ((fn: (s: object) => void) => { listener = fn; return () => undefined; }) as never };
    startUsage(api, deps(sender('retry').send, DAY));
    const ready = { isReady: () => true, exporting: null, logs: {}, programs: {}, sync: null };
    listener({ ...ready, isReady: () => false, programs: { A: {} } });
    listener(ready); // first ready state: the baseline
    expect(raw('usage:counts')).toEqual({ app_open: 1 });
    listener({ ...ready, programs: { A: {} } });
    expect(raw('usage:counts')).toEqual({ app_open: 1, program_edited: 1 });
  });
});
