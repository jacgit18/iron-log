import { describe, it, expect } from 'vitest';
import { DEFAULT_CFG } from './logic.js';
import { entryVolume, volumeByWeek, personalBests } from './trends.js';

const cfg = (over = {}) => ({ ...structuredClone(DEFAULT_CFG), ...over });

describe('entryVolume', () => {
  it('multiplies sets × reps × weight for a uniform session', () => {
    expect(entryVolume({ d: '2026-10-05', w: 100, s: 3, r: 8 })).toBe(2400);
    expect(entryVolume({ d: '2026-10-05', w: 100, s: 3, r: 8, sets: [{ w: 100, r: 8 }] })).toBe(2400);
  });
  it('adds each set when they differ', () => {
    expect(entryVolume({ d: '2026-10-05', w: 100, s: 3, r: 8, sets: [{ w: 100, r: 8 }, { w: 110, r: 6 }, { w: 120, r: 4 }] })).toBe(800 + 660 + 480);
  });
  it('counts bodyweight, blank and timed sets as 0', () => {
    expect(entryVolume({ d: '2026-10-05', s: 3, r: 10 })).toBe(0);
    expect(entryVolume({ d: '2026-10-05', w: 50, s: 3, sec: 30 })).toBe(0);
    expect(entryVolume({ d: '2026-10-05', w: 50, s: 2, r: 5, sets: [{ w: null, r: 5 }, { w: 50, r: 5 }] })).toBe(250);
  });
  it('counts a check-off (the sets were done)', () => {
    expect(entryVolume({ d: '2026-10-05', w: 100, s: 2, r: 5, auto: true })).toBe(1000);
  });
});

describe('volumeByWeek', () => {
  it('totals per week and splits by muscle, secondary at half', () => {
    const c = cfg({ muscleMap: { ...DEFAULT_CFG.muscleMap, x: { p: ['quads'], s: ['glutes'] } } });
    const logs = { x: [{ d: '2026-10-05', w: 100, s: 2, r: 5 }, { d: '2026-10-13', w: 100, s: 1, r: 5 }, { d: '2026-01-01', w: 999, s: 9, r: 9 }] };
    const v = volumeByWeek(c, logs, ['2026-10-04', '2026-10-11']);
    expect(v.total).toEqual({ '2026-10-04': 1000, '2026-10-11': 500 });
    expect(v.muscle.quads).toMatchObject({ '2026-10-04': 1000, '2026-10-11': 500 });
    expect(v.muscle.glutes).toMatchObject({ '2026-10-04': 500, '2026-10-11': 250 });
    expect(v.muscle.chest['2026-10-04']).toBe(0);
  });
});

describe('personalBests', () => {
  const L = [
    { d: '2026-09-01', w: 100, s: 3, r: 8 },
    { d: '2026-09-08', w: 100, s: 3, r: 8 },                // ties: not a best
    { d: '2026-09-15', w: 105, s: 3, r: 6 },                // heavier
    { d: '2026-09-22', w: 105, s: 3, r: 8 },                // more reps at the same weight
    { d: '2026-09-29', w: 200, s: 3, r: 8, auto: true },    // check-off: ignored
    { d: '2026-10-06', w: 95, s: 2, r: 8, sets: [{ w: 95, r: 8 }, { w: 110, r: 3 }] }, // top set 110 × 3
  ];
  it('lists sessions that beat the earlier best, newest first, without check-offs', () => {
    expect(personalBests({ x: L }, '2026-01-01')).toEqual([
      { id: 'x', d: '2026-10-06', w: 110, r: 3, prev: { w: 105, r: 8, d: '2026-09-22' } },
      { id: 'x', d: '2026-09-22', w: 105, r: 8, prev: { w: 105, r: 6, d: '2026-09-15' } },
      { id: 'x', d: '2026-09-15', w: 105, r: 6, prev: { w: 100, r: 8, d: '2026-09-01' } },
    ]);
  });
  it('compares against older sessions but only lists bests since the date', () => {
    expect(personalBests({ x: L }, '2026-09-20').map(b => b.d)).toEqual(['2026-10-06', '2026-09-22']);
  });
  it('a first session and bodyweight or timed work are never bests', () => {
    expect(personalBests({ x: [{ d: '2026-10-01', w: 100, s: 3, r: 5 }], y: [{ d: '2026-10-01', s: 3, r: 10 }, { d: '2026-10-08', s: 3, r: 12 }], z: [{ d: '2026-10-01', w: 20, s: 3, sec: 30 }, { d: '2026-10-08', w: 25, s: 3, sec: 30 }] }, '2026-01-01')).toEqual([]);
  });
});
