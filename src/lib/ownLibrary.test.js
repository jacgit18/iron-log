import { describe, it, expect, afterEach } from 'vitest';
import { BUILTIN, EX, allExIds, exInfo, findExId, exerciseChoice, listBuiltinExercises, isOwnExercise } from './data.js';
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
  it('lists only saved exercises, every one marked Yours, including ones saved under a built-in id', () => {
    listBuiltinExercises(false);
    const c = cfg({ ex: { hack: { n: 'Hack Squat', eq: 'machine' }, 'my-lift': { n: 'My Lift' } } });
    const rows = libraryRows(c, state);
    expect(rows.map(r => r.id)).toEqual(['hack', 'my-lift']);
    expect(rows.every(r => r.custom)).toBe(true);
    expect(filterRows(rows, { src: 'yours' })).toHaveLength(2);
    expect(isOwnExercise('hack')).toBe(true);
  });
  it('a typed built-in name is a new exercise, not the built-in, and its new id never takes a built-in id', () => {
    listBuiltinExercises(false);
    expect(findExId(cfg(), 'Hack Squat')).toBeNull();
    expect(exerciseChoice(cfg(), 'Hack Squat')).toEqual({ ex: '__new', nn: 'Hack Squat' });
  });
  it('history that points at a built-in id still shows its name', () => {
    listBuiltinExercises(false);
    expect(exInfo(cfg(), 'hack').n).toBe(EX.hack.n);
  });
  it('local storage still lists the built-ins, not marked Yours', () => {
    expect(allExIds(cfg())).toEqual(expect.arrayContaining(Object.keys(EX)));
    expect(isOwnExercise('hack')).toBe(false);
    expect(isOwnExercise('my-lift')).toBe(true);
  });
});
