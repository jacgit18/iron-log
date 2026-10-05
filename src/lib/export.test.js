import { describe, it, expect } from 'vitest';
import * as X from 'xlsx';
import { BUILTIN, exInfo } from './data.js';
import { DEFAULT_CFG } from './logic.js';
import { buildWeekWorkbook, buildCsv, buildDataFile, parseDataFile, mergeEntries, mergeWeek } from './export.js';

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

it('the week workbook lists experiment cards on the Plan sheet', () => {
  const S = { cfg: structuredClone(DEFAULT_CFG), logs: {}, programs: { A: BUILTIN.A, B: BUILTIN.B }, library: [], body: [], experiments: [] };
  const w = { done: { 'X-1': true }, extra: [{ id: 'X-1', day: 2, ex: 'hack', ph: 'hyp' }] };
  const rows = X.utils.sheet_to_json(buildWeekWorkbook(X, S, '2026-09-27', w).Sheets.Plan, { header: 1 });
  expect(rows.some(r => r[2] === 'Experiment' && r[5] === exInfo(S.cfg, 'hack').n && r[9] === 'Yes')).toBe(true);
});

describe('import tab choices', () => {
  it('selects every tab unless one is switched off', async () => {
    const { importSel, cfgSection } = await import('./export.js');
    expect(importSel({})).toEqual({ board: true, progress: true, muscles: true, program: true, stretches: true, supplements: true, settings: true });
    expect(importSel({ sel: { progress: false } })).toMatchObject({ progress: false, board: true });
    expect(['muscleMap', 'ex', 'progNames', 'rm', 'mode'].map(cfgSection)).toEqual(['muscles', 'program', 'program', 'settings', 'settings']);
  });
});

describe('old Day 5/6 subtitles', () => {
  it('are dropped from saved programs when they load', async () => {
    const { withAllDays } = await import('./data.js');
    const p = withAllDays({ days: [{ title: 'Day 5', sub: 'Upper body + rotational power', slots: [] }, { title: 'Day 6', sub: 'Lower body + reactive power', slots: [] }, { title: 'Day 1', sub: 'Mine', slots: [] }] });
    expect(p.days.slice(0, 3).map(d => d.sub)).toEqual([undefined, undefined, 'Mine']);
  });
});

describe('a data file with bad shapes', () => {
  const parse = over => parseDataFile(JSON.stringify({ ...buildDataFile(snapshot(), {}), ...over }));
  it('drops config values of the wrong type instead of passing them on', () => {
    const d = parse({ config: { pct: null, rm: 'x', mode: 9, rest: Infinity, keep: 1 } });
    expect(d.config).toEqual({ keep: 1 });
  });
  it('clears an unknown phase so exports do not throw', () => {
    const d = parse({ logs: { hack: [{ d: '2026-09-21', ph: 'bogus', w: 100, s: 3, r: 5 }] } });
    expect(d.logs.hack[0].ph).toBeNull();
    expect(() => buildCsv({ ...snapshot(), logs: d.logs })).not.toThrow();
  });
  it('csv export tolerates an unknown phase already in the logs', () => {
    expect(() => buildCsv({ ...snapshot(), logs: { hack: [{ d: '2026-09-21', ph: 'bogus', w: 1, s: 1, r: 1 }] } })).not.toThrow();
  });
  it('skips a log id of __proto__', () => {
    const text = JSON.stringify({ ...buildDataFile(snapshot(), {}) }).replace('"logs":{', '"logs":{"__proto__":[{"d":"2026-09-21"}],');
    expect(Object.getPrototypeOf(parseDataFile(text).logs)).toBe(Object.prototype);
  });
});
