import { describe, it, expect } from 'vitest';
import { BUILTIN } from '../lib/data.js';
import { validStamp, SCHEMA_VERSION, normProgram, normLibrary, normEntry, normEntries, normBody, setError, validDate, validBodyLb, validLiftGoalLb, validRest, validPct, validRm, validMode, validOz, validGoal } from './validate.js';
import { normalizeData, normConfig } from '../lib/export.js';
import { normWeek } from '../lib/logic.js';

const junk = [NaN, Infinity, -Infinity, undefined, null, '5', {}, []];

describe('validate', () => {
  it('rejects non-numbers and non-finite values everywhere', () => {
    [validBodyLb, validLiftGoalLb, validRest, validPct, validRm, validOz, validGoal].forEach(f => junk.forEach(v => expect(f(v)).toBe(false)));
  });
  it('body weight: above 0, below 1500', () => {
    expect([validBodyLb(0), validBodyLb(-1), validBodyLb(0.1), validBodyLb(1499.9), validBodyLb(1500)]).toEqual([false, false, true, true, false]);
  });
  it('lift goal: above 0, below 5000', () => {
    expect([validLiftGoalLb(0), validLiftGoalLb(4999), validLiftGoalLb(5000)]).toEqual([false, true, false]);
  });
  it('rest timer: 0 to 600 inclusive', () => {
    expect([validRest(-1), validRest(0), validRest(600), validRest(601)]).toEqual([false, true, true, false]);
  });
  it('percent of 1RM: 0 to 110 inclusive', () => {
    expect([validPct(-1), validPct(0), validPct(110), validPct(111)]).toEqual([false, true, true, false]);
  });
  it('1RM: any positive number', () => {
    expect([validRm(0), validRm(225)]).toEqual([false, true]);
  });
  it('mode is 1, 2 or 3 as a number', () => {
    expect([validMode(1), validMode(3), validMode(0), validMode(4), validMode('2')]).toEqual([true, true, false, false, false]);
  });
  it('water: a drink is up to 200 oz, a goal 8 to 500', () => {
    expect([validOz(0), validOz(200), validOz(201), validGoal(7), validGoal(8), validGoal(500), validGoal(501)]).toEqual([false, true, false, false, true, true, false]);
  });
});

describe('validDate', () => {
  it('needs a real calendar day', () => {
    expect(['2026-10-05', '2024-02-29'].map(validDate)).toEqual([true, true]);
    expect(['2026-02-31', '2026-13-01', '2026-1-5', 'abc', '1900-01-01', 20261005, null].map(validDate)).toEqual([false, false, false, false, false, false, false]);
  });
});

describe('normEntry', () => {
  const good = { id: 'L1', d: '2026-10-05', ph: 'hyp', w: 135, s: 3, r: 8, sets: [{ w: 135, r: 8 }], n: 'felt good', slot: 'a1', wk: '2026-10-05' };
  it('keeps a good entry as it is', () => {
    expect(normEntry(good)).toEqual(good);
  });
  it('rejects only on a bad date or a non-object', () => {
    ['abc', '2026-02-31', undefined, 5].forEach(d => expect(normEntry({ ...good, d })).toBeNull());
    [null, 'x', 7, [], undefined].forEach(v => expect(normEntry(v)).toBeNull());
  });
  it('drops bad numbers to null and keeps the session', () => {
    const e = normEntry({ d: '2026-10-05', w: 'abc', s: 2.5, r: -3, sec: Infinity });
    expect(e).toEqual({ d: '2026-10-05', w: null, s: null, r: null, sec: null });
  });
  it('coerces numeric strings and blanks, as the old data stored them', () => {
    expect(normEntry({ d: '2026-10-05', w: '225', r: '' })).toEqual({ d: '2026-10-05', w: 225, r: null });
  });
  it('cleans sets, caps their count, and drops non-objects', () => {
    const e = normEntry({ d: '2026-10-05', sets: [{ w: 100, r: 5 }, 'x', null, { w: 99999, r: 5 }, { w: 5, sec: 30 }] });
    expect(e.sets).toEqual([{ w: 100, r: 5 }, { w: null, r: 5 }, { w: 5, sec: 30 }]);
    expect(normEntry({ d: '2026-10-05', sets: Array.from({ length: 500 }, () => ({ w: 1, r: 1 })) }).sets).toHaveLength(200);
  });
  it('drops unknown fields, bad phases, wrong-typed text and a bad week', () => {
    const e = normEntry({ d: '2026-10-05', ph: 'nope', n: { x: 1 }, slot: 5, wk: 'soon', id: {}, auto: 'yes', evil: 1 });
    expect(e).toEqual({ d: '2026-10-05', ph: null });
  });
  it('keeps auto only when true, and caps note length', () => {
    expect(normEntry({ d: '2026-10-05', auto: true }).auto).toBe(true);
    expect(normEntry({ d: '2026-10-05', n: 'x'.repeat(900) }).n).toHaveLength(500);
  });
  it('normEntries filters and tolerates a non-array', () => {
    expect(normEntries([good, null, { d: 'bad' }])).toEqual([good]);
    expect(normEntries(undefined)).toEqual([]);
    expect(normEntries({})).toEqual([]);
  });
});

describe('normBody', () => {
  it('keeps one valid weigh-in per week', () => {
    const out = normBody([{ wk: '2026-10-05', d: '2026-10-06', w: '180.5' }, { wk: '2026-10-05', d: '2026-10-07', w: 181 }, { wk: '2026-10-12', d: '2026-10-13', w: 99999 }, { wk: 'x', d: '2026-10-13', w: 180 }, { wk: '2026-10-19', d: 'x', w: 180 }, null]);
    expect(out).toEqual([{ wk: '2026-10-05', d: '2026-10-06', w: 180.5 }]);
  });
});

describe('setError', () => {
  it('names the first out-of-range value', () => {
    expect(setError([{ w: 100, r: 5 }], false)).toBe('');
    expect(setError([{ w: -1, r: 5 }], false)).toMatch(/Weight/);
    expect(setError([{ w: 1, r: 5000 }], false)).toMatch(/Reps/);
    expect(setError([{ w: 1, sec: 999999 }], true)).toMatch(/Hold/);
  });
});

describe('normConfig, deeper', () => {
  it('filters bad percent, 1RM and goal values and keeps the rest', () => {
    const c = normConfig({ pct: { hyp: 70, str: 500, '__proto__': 5 }, rm: { bench: 225, squat: -5, row: 'x' }, bwGoal: { w: 99999 }, liftGoals: { bench: { any: { w: 315 }, hyp: { w: -1 } }, bad: 4 }, backup: { repo: 'not a repo' } });
    expect(c.pct.hyp).toBe(70); expect(c.pct.str).not.toBe(500);
    expect(c.rm).toEqual({ bench: 225 });
    expect('bwGoal' in c).toBe(false);
    expect(c.liftGoals).toEqual({ bench: { any: { w: 315 } } });
    expect('backup' in c).toBe(false);
  });
  it('keeps a valid backup repo', () => {
    expect(normConfig({ backup: { repo: 'me/data', branch: 'main' } }).backup.repo).toBe('me/data');
  });
});

describe('normalizeData cleans sessions and body weight', () => {
  it('applies the entry and body rules', () => {
    const d = normalizeData({ logs: { bench: [{ d: '2026-10-05', w: 'x', r: 5 }, { d: '2026-02-31', w: 100 }, { d: 7 }] }, body: [{ wk: '2026-10-05', d: '2026-10-05', w: 5000 }] });
    expect(d.logs.bench).toEqual([{ d: '2026-10-05', w: null, r: 5 }]);
    expect(d.body).toEqual([]);
  });
});

describe('normWeek contents', () => {
  it('keeps good data as it is', () => {
    const w = { prog: 'B', done: { 'A-d1s1:0': true, 'ss#1': true }, skipped: { 'A-d2s1:0': true }, moved: { 'A-d1s1:0': 3 }, ph: { 'A-d1s1:0': 'hyp' }, warm: { 1: { w1: true, w2: false } } };
    expect(normWeek(w)).toEqual(w);
  });
  it('drops bad programs, phases, keys and wrong-typed values', () => {
    const w = normWeek({ prog: 'Z', done: { a: 1, b: 0, ['x'.repeat(200)]: true, 'bad\nkey': true }, skipped: [true], ph: { a: 'nope', b: 'hyp', c: 5 }, moved: { a: 9, b: 2, c: 'x' }, warm: { 1: { a: 'yes', b: true }, 2: { a: 'no' }, 3: 'x' } });
    expect(w.prog).toBeNull();
    expect(w.done).toEqual({ a: true });
    expect(w.skipped).toEqual({});
    expect(w.ph).toEqual({ b: 'hyp' });
    expect(w.moved).toEqual({ b: 2 });
    expect(w.warm).toEqual({ 1: { b: true } });
  });
  it('ignores prototype keys and non-object sections', () => {
    const w = normWeek(JSON.parse('{"done":{"__proto__":true,"constructor":true,"a":true},"ph":"x","warm":null}'));
    expect(Object.keys(w.done)).toEqual(['a']);
    expect(w.ph).toEqual({});
    expect(w.warm).toEqual({});
    expect({}.polluted).toBeUndefined();
  });
});

describe('normProgram and normLibrary', () => {
  it('leave the built-in programs unchanged', () => {
    ['A', 'B'].forEach(k => expect(normProgram(structuredClone(BUILTIN[k]), k)).toEqual(structuredClone(BUILTIN[k])));
  });
  it('reject the wrong shape, so the built-in program is used instead', () => {
    [null, 'x', {}, { days: 'x' }, { days: [] }, { days: Array.from({ length: 9 }, () => ({ slots: [] })) }].forEach(p => expect(normProgram(p, 'A')).toBeNull());
  });
  const prog = (slots, extra = {}) => ({ days: Array.from({ length: 7 }, (_, i) => (i === 0 ? { title: 'Day 1', slots } : { title: `Day ${i + 1}`, slots: [] })), ...extra });
  it('drops bad items and slots but keeps the ids of the slots after them', () => {
    const p = normProgram(prog([
      { items: [{ ex: '__proto__' }] },                                // all items bad: slot dropped
      { items: [{ ex: 'bench', ph: 'nope', w: 99999, rx: 5 }, null, { ex: '' }] }, // no id: gets the one its position implies
      { id: 'mine', sec: 'Home', tier: 'Primary', type: 'weird', items: [{ ex: 'row', ph: 'hyp', w: 45, bw: true, note: 'n' }] },
    ]), 'A');
    expect(p.days[0].slots).toEqual([
      { id: 'A-d1s2', items: [{ ex: 'bench', ph: null, w: null }] },
      { id: 'mine', sec: 'Home', tier: 'Primary', items: [{ ex: 'row', ph: 'hyp', w: 45, bw: true, note: 'n' }] },
    ]);
  });
  it('keeps slot ids unique, fills day titles and drops unknown fields', () => {
    const p = normProgram(prog([{ id: 'dup', items: [{ ex: 'a' }] }, { id: 'dup', items: [{ ex: 'b' }] }], { evil: 1, warm: 'shadow box', sledAdded: true, sledTop: 'yes' }), 'A');
    expect(p.days[0].slots.map(s => s.id)).toEqual(['dup', 'dup_']);
    expect(p.warm).toBe('shadow box'); expect(p.sledAdded).toBe(true);
    expect('sledTop' in p).toBe(false); expect('evil' in p).toBe(false);
  });
  it('normLibrary keeps good versions, defaults the name, and drops duplicates and bad programs', () => {
    const good = prog([{ items: [{ ex: 'a' }] }]);
    const out = normLibrary([{ id: 'v1', name: 'Mine', from: 'B', at: '2026-10-05T10:00:00Z', created: true, prog: good }, { id: 'v1', prog: good }, { id: 'v2', prog: good }, { id: 'v3', prog: {} }, { prog: good }, null]);
    expect(out.map(x => x.id)).toEqual(['v1', 'v2']);
    expect(out[0]).toMatchObject({ name: 'Mine', from: 'B', created: true });
    expect(out[1].name).toBe('Saved version');
    expect(normLibrary(undefined)).toEqual([]);
  });
  it('normalizeData applies them to files', () => {
    const d = normalizeData({ programs: { A: prog([{ items: [{ ex: 'bench' }, { ex: 5 }] }]), B: 'junk' }, library: [{ id: 'v1', prog: prog([{ items: [{ ex: 'a' }] }]) }, { id: 'v2', prog: { days: 3 } }] });
    expect(d.programs.A.days[0].slots.find(sl => sl.items.some(i => i.ex === 'bench')).items).toEqual([{ ex: 'bench', ph: null, w: null }]); // the sled card is added up front
    expect(d.programs.B).toBeUndefined();
    expect(d.library.map(x => x.id)).toEqual(['v1']);
  });
});

describe('updatedAt', () => {
  it('accepts ISO date-times and nothing else', () => {
    ['2026-10-05T10:00:00.000Z', '2026-10-05T10:00:00+02:00'].forEach(v => expect(validStamp(v)).toBe(true));
    ['2026-10-05', 'yesterday', '', null, 5, '2026-13-45T99:00:00Z', 'x'.repeat(50)].forEach(v => expect(validStamp(v)).toBe(false));
  });
  it('is kept on sessions and body weights when valid and dropped when not', () => {
    const at = '2026-10-05T10:00:00.000Z';
    expect(normEntry({ d: '2026-10-05', updatedAt: at }).updatedAt).toBe(at);
    expect('updatedAt' in normEntry({ d: '2026-10-05', updatedAt: 'soon' })).toBe(false);
    expect(normBody([{ wk: '2026-10-05', d: '2026-10-05', w: 180, updatedAt: at }])[0].updatedAt).toBe(at);
    expect('updatedAt' in normBody([{ wk: '2026-10-05', d: '2026-10-05', w: 180, updatedAt: 1 }])[0]).toBe(false);
  });
  it('schema version starts at 1', () => { expect(SCHEMA_VERSION).toBe(1); });
});
