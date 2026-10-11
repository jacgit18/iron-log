import { describe, it, expect, afterEach } from 'vitest';
import { BUILTIN, EX, allExIds, exInfo, findExId, exerciseChoice, newExId, listBuiltinExercises, isOwnExercise } from './data.js';
import { buildCsv } from './export.js';
import { parseCsvExport } from './excelImport.js';
import { DEFAULT_CFG } from './logic.js';
import { libraryRows, filterRows } from './exerciseLibrary.js';

// Synced, the library is the account's own exercises only (ADR 024); in local storage the built-ins stay listed.
const cfg = (over = {}) => ({ ...structuredClone(DEFAULT_CFG), ...over });
const state = { programs: { A: BUILTIN.A, B: BUILTIN.B }, library: [], experiments: [], logs: {} };
afterEach(() => listBuiltinExercises(true));

describe('synced exercise library (ADR 024)', () => {
  it('a new account starts with an empty library', () => {
    listBuiltinExercises(false);
    expect(allExIds(cfg())).toEqual([]);
    expect(libraryRows(cfg(), state)).toEqual([]);
  });
  it('lists only saved exercises, every one marked Custom, including ones saved under a built-in id', () => {
    listBuiltinExercises(false);
    const c = cfg({ ex: { hack: { n: 'Hack Squat', eq: 'machine' }, 'my-lift': { n: 'My Lift' } } });
    const rows = libraryRows(c, state);
    expect(rows.map(r => r.id)).toEqual(['hack', 'my-lift']);
    expect(rows.every(r => r.custom)).toBe(true);
    expect(filterRows(rows, { src: 'custom' })).toHaveLength(2);
    expect(isOwnExercise('hack')).toBe(true);
  });
  it("a typed built-in name is new to the library, and takes the built-in's id so history under that id stays one exercise", () => {
    listBuiltinExercises(false);
    expect(findExId(cfg(), 'Hack Squat')).toBeNull();
    expect(exerciseChoice(cfg(), 'Hack Squat')).toEqual({ ex: '__new', nn: 'Hack Squat' });
    expect(newExId(cfg(), ' hack  squat ')).toBe('hack');
    // once saved (or renamed) under that id, another of the same name gets its own id
    expect(newExId(cfg({ ex: { hack: { n: 'Heels Up' } } }), 'Hack Squat')).toBe('hack-squat');
  });
  it('an import that uses a built-in adds it to the library under the same id', async () => {
    const logs = { hack: [{ d: '2026-09-21', ph: 'hyp', w: 270, s: 2, r: 12 }] };
    listBuiltinExercises(false);
    const d = await parseCsvExport(buildCsv({ cfg: cfg(), logs, body: [] }), cfg());
    expect(Object.keys(d.logs)).toEqual(['hack']);
    expect(d.config.ex).toEqual({ hack: { n: EX.hack.n } });
    listBuiltinExercises(true);
    expect((await parseCsvExport(buildCsv({ cfg: cfg(), logs, body: [] }), cfg())).config.ex).toEqual({}); // local: built-ins are listed already
  });
  it('history that points at a built-in id still shows its name', () => {
    listBuiltinExercises(false);
    expect(exInfo(cfg(), 'hack').n).toBe(EX.hack.n);
  });
  it('local storage still lists the built-ins, not marked Custom', () => {
    expect(allExIds(cfg())).toEqual(expect.arrayContaining(Object.keys(EX)));
    expect(newExId(cfg(), 'Hack Squat')).toBe('hack-squat');
    expect(isOwnExercise('hack')).toBe(false);
    expect(isOwnExercise('my-lift')).toBe(true);
  });
});
