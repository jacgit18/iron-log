import { describe, it, expect } from 'vitest';
import { BUILTIN } from './data.js';
import { DEFAULT_CFG } from './logic.js';
import { libraryRows, filterRows, usageOf } from './exerciseLibrary.js';

const cfg = (over = {}) => ({ ...structuredClone(DEFAULT_CFG), ...over });
const state = (over = {}) => ({ programs: { A: BUILTIN.A, B: BUILTIN.B }, library: [], experiments: [], logs: {}, ...over });

describe('exercise library rows', () => {
  it('lists built-in and your own exercises alphabetically, with what is set on each', () => {
    const c = cfg({ ex: { 'my-lift': { n: 'Aardvark Curl', eq: 'cable' } }, exPh: { hack: 'hyp' }, rm: { hack: 400 } });
    const rows = libraryRows(c, state());
    expect(rows[0]).toMatchObject({ id: 'my-lift', name: 'Aardvark Curl', custom: true, eq: 'cable', tagged: false, inPrograms: [] });
    const hack = rows.find(r => r.id === 'hack');
    expect(hack).toMatchObject({ name: 'Hack Squat', eq: 'machine', ph: 'hyp', rm: 400, custom: false, p: ['quads'] });
    expect(hack.inPrograms).toEqual(['A', 'B']);
    expect(rows.map(r => r.name)).toEqual([...rows.map(r => r.name)].sort((a, b) => a.localeCompare(b)));
  });
  it('filters by name, equipment and muscle (primary or secondary), and finds untagged ones', () => {
    const rows = libraryRows(cfg({ ex: { x: { n: 'Mystery Move' } } }), state());
    expect(filterRows(rows, { q: ' hack ' }).map(r => r.id)).toEqual(['hack']);
    expect(filterRows(rows, { eq: 'trx' }).every(r => r.eq === 'trx')).toBe(true);
    expect(filterRows(rows, { muscle: 'glutes' }).some(r => r.id === 'hack')).toBe(true); // secondary counts
    expect(filterRows(rows, { muscle: 'untagged' }).map(r => r.id)).toEqual(['x']);
    expect(filterRows(rows, { eq: 'none' }).some(r => r.id === 'x')).toBe(true);
    expect(filterRows(rows, {})).toHaveLength(rows.length);
  });
  it('knows where an exercise is used', () => {
    const lib = [{ id: 'v', name: 'v', prog: { days: [{ title: 'D', slots: [{ id: 's', items: [{ ex: 'zzz' }] }] }, ...Array(5).fill({ title: 'D', slots: [] })] } }];
    expect(usageOf('zzz', state({ library: lib, experiments: [{ id: 'e', ex: 'zzz' }], logs: { zzz: [{}, {}] } }))).toEqual({ programs: [], versions: 1, experiments: 1, logs: 2 });
    expect(usageOf('hack', state()).programs).toEqual(['A', 'B']);
  });
});
