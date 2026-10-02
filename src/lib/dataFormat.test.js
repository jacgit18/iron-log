/* The iron-log-data.json format (format 1), pinned down with a sample file.
   Every backup, export and GitHub restore uses this format, and a future backend has to import the
   files people already have. If a test here fails, the format changed: bump DATA_FORMAT and keep
   reading format 1, don't edit the fixture to match. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDataFile, buildDataFile, dataStats, mergeWeek, DATA_FORMAT } from './export.js';
import { BUILTIN, withAllDays } from './data.js';

const text = readFileSync(new URL('../test/fixtures/iron-log-data.v1.json', import.meta.url), 'utf8');
const raw = JSON.parse(text);
const d = parseDataFile(text);

describe('iron-log-data.json, format 1', () => {
  it('is the format this version writes', () => {
    expect(DATA_FORMAT).toBe(1);
    expect(raw).toMatchObject({ app: 'iron-log', format: 1, exportedAt: '2026-09-28T12:00:00.000Z' });
    expect(Object.keys(raw)).toEqual(['app', 'format', 'exportedAt', 'config', 'programs', 'library', 'logs', 'weeks', 'body']);
  });

  it('reads every part of the file', () => {
    expect(dataStats(d)).toEqual({ entries: 5, exercises: 4, weeks: 2, programs: ['A'], saved: 2, body: 2 });
  });

  it('keeps settings: mode, rest, phase %, prescriptions, 1RMs, phase defaults, custom exercises and tags, names', () => {
    expect(d.config).toMatchObject({
      mode: 2, m2Even: 'B', rest: 75,
      pct: { strength: 80, iso: 75, hyp: 60, exp: 45 },
      rxOverride: { strength: '5 × 5' },
      rm: { hack: 400, chestpress: 60 },
      phDef: { 'A-d1s1:0': 'strength' },
      ex: { 'sled-drag': { n: 'Sled Drag', url: 'https://example.com/sled' } },
      muscleMap: { 'sled-drag': { p: ['quads', 'glutes'], s: ['calves'] } },
      progNames: { A: 'Upper/Lower', B: 'Power' },
    });
    expect(d.config.ghBackup.repo).toBe('someone/iron-log');
    expect(d.config).not.toHaveProperty('token');
  });

  it('keeps an edited program: seven days, slot ids, supersets, either/or, notes', () => {
    const A = d.programs.A;
    expect(A.days).toHaveLength(7);
    expect(A.warm).toBe('Row 5 min');
    expect(A.days[0].slots.map(s => s.id)).toEqual(['A-d1s1', 'A-d1s2']);
    expect(A.days[0].slots[1]).toMatchObject({ type: 'superset', items: [{ ex: 'chestpress' }, { ex: 'zercher' }] });
    expect(A.days[1].slots[0]).toMatchObject({ type: 'either', note: 'Whichever is free', items: [{ ex: 'reardelt', rx: '4 × 15 s per arm' }, { ex: 'facepull' }] });
    expect(A.days[4]).toMatchObject({ sub: 'Make-up', makeup: true });
    expect(d.programs.B).toBeUndefined(); // built-in programs aren't written
  });

  it('pads a 6-day program from an old backup with an empty Day 7', () => {
    expect(d.programs.A.days[6]).toEqual({ title: 'Day 7', slots: [] });
  });

  it('keeps saved versions, including automatic ones', () => {
    expect(d.library.map(it => [it.id, it.from, !!it.auto, it.prog.days.length])).toEqual([['mk3x9a1b', 'A', false, 7], ['mk3xauto', 'B', true, 7]]);
  });

  it('keeps every kind of logged session', () => {
    const [plain, perSet] = d.logs.hack;
    expect(plain).toEqual({ d: '2026-09-14', ph: 'hyp', w: 270, s: 4, r: 15, slot: 'A-d1s1', wk: '2026-09-13' });
    expect(perSet).toMatchObject({ w: 320, s: 3, r: 5, n: 'Heavy, felt good', sets: [{ w: 320, r: 6 }, { w: 320, r: 5 }, { w: 315, r: 6 }] });
    expect(d.logs.reardelt[0]).toMatchObject({ ph: 'iso', sec: 20, sets: [{ w: 50, sec: 25 }, { w: 50, sec: 20 }, { w: 50, sec: 20 }, { w: 50, sec: 22 }] });
    expect(d.logs.chestpress[0].auto).toBe(true); // logged by a check-off
    expect(d.logs['sled-drag'][0]).toEqual({ d: '2026-09-24', ph: null, w: null, s: 3, r: 20 }); // bodyweight, custom exercise
  });

  it('keeps each week: program, check-offs, superset halves, skips, moves, phase changes, warm-up', () => {
    expect(d.weeks['2026-09-20']).toEqual({
      prog: 'A',
      done: { 'A-d1s1': true, 'A-d1s2#0': true, 'A-d2s1': true, 'A-d2s1#0': true },
      skipped: { 'A-d3s1': true },
      moved: { 'A-d1s2': 2 },
      ph: { 'A-d1s1:0': 'strength' },
      warm: { 1: { shadow: true, sled: false } },
    });
  });

  it('keeps body weight, one per week, in week order', () => {
    expect(d.body).toEqual([{ wk: '2026-09-13', d: '2026-09-13', w: 182 }, { wk: '2026-09-20', d: '2026-09-21', w: 181.5 }]);
  });

  it('writes back exactly what it read, so nothing is lost on a round trip', () => {
    const S = { cfg: d.config, logs: d.logs, programs: { A: { ...d.programs.A, key: 'A' }, B: BUILTIN.B }, library: d.library, body: d.body };
    const again = buildDataFile(S, d.weeks);
    // the fixture is an old 6-day backup, so what comes back has the empty Day 7 added
    const padded = { ...raw, programs: { A: withAllDays(raw.programs.A) }, library: raw.library.map(it => ({ ...it, prog: withAllDays(it.prog) })) };
    expect({ ...again, exportedAt: raw.exportedAt }).toEqual(padded);
  });
});

it('mergeWeek keeps a rest day from either side, preferring this device', () => {
  expect(mergeWeek({ rest: 2 }, { rest: 5 }).rest).toBe(2);
  expect(mergeWeek({}, { rest: 5 }).rest).toBe(5);
  expect(mergeWeek({}, {})).not.toHaveProperty('rest');
});

it('mergeWeek keeps this device’s order, falls back to the other side, and ignores an invalid one', () => {
  const a = [2, 1, 3, 4, 5, 6, 7], b = [1, 2, 3, 4, 5, 7, 6];
  expect(mergeWeek({ order: a }, { order: b }).order).toEqual(a);
  expect(mergeWeek({}, { order: b }).order).toEqual(b);
  expect(mergeWeek({ order: [1, 1, 3, 4, 5, 6, 7] }, { order: b }).order).toEqual(b);
  expect(mergeWeek({}, {})).not.toHaveProperty('order');
});
