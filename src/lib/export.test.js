import { describe, it, expect } from 'vitest';
import { BUILTIN } from './data.js';
import { DEFAULT_CFG } from './logic.js';
import { buildCsv, buildDataFile, parseDataFile, mergeEntries, mergeWeek } from './export.js';

const snapshot = () => ({
  cfg: { ...structuredClone(DEFAULT_CFG), rm: { hack: 400 } },
  logs: { hack: [{ d: '2026-09-21', ph: 'hyp', w: 270, s: 4, r: 15, n: 'Felt good, "easy"' }], empty: [] },
  programs: { A: BUILTIN.A, B: BUILTIN.B },
  library: [],
  body: [{ wk: '2026-09-27', d: '2026-09-28', w: 181 }, { wk: '2026-09-20', d: '2026-09-21', w: 180.5 }],
});

describe('CSV export', () => {
  it('quotes cells with commas and quotes', () => {
    const [head, row] = buildCsv(snapshot()).split('\r\n');
    expect(head.split(',')[0]).toBe('date');
    expect(row).toContain('Hack Squat,Hypertrophy,270,4,15');
    expect(row).toContain('"Felt good, ""easy"""');
  });
});

describe('JSON data file', () => {
  it('round-trips through build and parse', () => {
    const weeks = { '2026-09-20': { done: { 'A-d1s1': true } }, '2026-09-27': {}, junk: { done: { x: true } } };
    const text = JSON.stringify(buildDataFile(snapshot(), weeks));
    const d = parseDataFile(text);
    expect(d.config.rm).toEqual({ hack: 400 });
    expect(Object.keys(d.logs)).toEqual(['hack']); // empty logs are left out
    expect(Object.keys(d.weeks)).toEqual(['2026-09-20']); // empty and invalid weeks are left out
    expect(d.weeks['2026-09-20'].done).toEqual({ 'A-d1s1': true });
    expect(d.body.map(b => b.wk)).toEqual(['2026-09-20', '2026-09-27']);
    expect(d.programs).toEqual({}); // built-in programs aren't written out
  });

  it('rejects files that are not Iron Log data', () => {
    expect(() => parseDataFile('not json')).toThrow('isn’t valid JSON');
    expect(() => parseDataFile('{"app":"other"}')).toThrow('isn’t an Iron Log data file');
    expect(() => parseDataFile('{"app":"iron-log","format":99}')).toThrow('newer version');
  });

  it('drops malformed entries instead of failing', () => {
    const d = parseDataFile(JSON.stringify({
      app: 'iron-log', format: 1,
      logs: { hack: [{ d: '2026-09-21', w: 1 }, null, { w: 2 }], 'bad id!': [{ d: '2026-09-21' }] },
      body: [{ wk: '2026-09-20', d: '2026-09-21', w: 0 }, { wk: 'nope', d: 'x', w: 180 }],
      programs: { A: { days: [] } },
    }));
    expect(d.logs).toEqual({ hack: [{ d: '2026-09-21', w: 1 }] });
    expect(d.body).toEqual([]);
    expect(d.programs).toEqual({});
  });
});

describe('merging', () => {
  it('adds only entries that are not already there, sorted by date', () => {
    const a = [{ d: '2026-09-02', w: 1 }];
    const m = mergeEntries(a, [{ d: '2026-09-02', w: 1 }, { d: '2026-09-01', w: 2 }]);
    expect(m).toEqual([{ d: '2026-09-01', w: 2 }, { d: '2026-09-02', w: 1 }]);
  });
  it('keeps local week state and fills in the rest; done beats skipped', () => {
    const local = { prog: 'B', done: { a: true }, moved: { a: 3 } };
    const file = { prog: 'A', done: { b: true }, skipped: { a: true, c: true }, moved: { a: 5, b: 2 } };
    const w = mergeWeek(local, file);
    expect(w.prog).toBe('B');
    expect(w.done).toEqual({ a: true, b: true });
    expect(w.skipped).toEqual({ c: true });
    expect(w.moved).toEqual({ a: 3, b: 2 });
  });
});
