import { describe, expect, it } from 'vitest';
import { DEFAULT_FREQ_GOAL_SORT, DEFAULT_WEIGHT_GOAL_SORT, sortFreqRows, sortWeightGoalRows, type GoalProgress } from './goalSort.js';
import { DEFAULT_LIFT_SORT, sortLiftIds } from './liftSort.js';
import { DEFAULT_PROGRAM_SORT, sortLibraryItems } from './programSort.js';
import { splitLibrary } from './programArchive.js';
import type { LibraryItem } from '../types.ts';

const prog = { days: [] } as any;
const item = (id: string, name: string, at: string): LibraryItem => ({ id, name, at, prog });

describe('sortLibraryItems', () => {
  const lib = [item('1', 'Éclair', '2026-01-01'), item('2', 'apple', '2026-03-01'), item('3', 'Zed', '2026-02-01'), item('4', 'Plan 10', '2026-03-01'), item('5', 'Plan 2', '2026-03-01')];
  it('defaults to newest first, saved at the same moment by name then id', () => {
    expect(DEFAULT_PROGRAM_SORT).toBe('newest');
    expect(sortLibraryItems(lib, 'newest').map(x => x.id)).toEqual(['2', '5', '4', '3', '1']);
  });
  it('sorts by name ignoring case and accents, numbers as numbers', () => {
    expect(sortLibraryItems(lib, 'name').map(x => x.id)).toEqual(['2', '1', '5', '4', '3']);
  });
  it('ties on equal names fall to id, whatever the input order', () => {
    const a = item('b', 'Same', '1'), b = item('a', 'same', '2');
    expect(sortLibraryItems([a, b], 'name').map(x => x.id)).toEqual(['a', 'b']);
    expect(sortLibraryItems([b, a], 'name').map(x => x.id)).toEqual(['a', 'b']);
  });
  it('does not change its input, and splitLibrary passes the sort to both groups', () => {
    const input = [...lib]; sortLibraryItems(input, 'name');
    expect(input).toEqual(lib);
    const { active, archived } = splitLibrary([lib[0], { ...lib[1], archived: true }, lib[2], { ...lib[3], archived: true }], 'name');
    expect(active.map(x => x.id)).toEqual(['1', '3']);
    expect(archived.map(x => x.id)).toEqual(['2', '4']);
  });
});

describe('sortLiftIds', () => {
  const names: Record<string, string> = { a: 'squat', b: 'Bench', c: 'curl', d: 'Bench' };
  const nameOf = (id: string) => names[id];
  const recent = ['c', 'a', 'd', 'b'];
  it('recent keeps the order given', () => { expect(DEFAULT_LIFT_SORT).toBe('recent'); expect(sortLiftIds(recent, 'recent', nameOf, () => false)).toEqual(recent); });
  it('name sorts ignoring case, equal names by id', () => expect(sortLiftIds(recent, 'name', nameOf, () => false)).toEqual(['b', 'd', 'c', 'a']));
  it('stalled puts the flagged first and keeps the recent order inside each group', () => {
    expect(sortLiftIds(recent, 'stalled', nameOf, id => id === 'a' || id === 'b')).toEqual(['a', 'b', 'c', 'd']);
  });
  it('does not change its input', () => { const r = [...recent]; sortLiftIds(r, 'name', nameOf, () => true); expect(r).toEqual(recent); });
});

describe('sortWeightGoalRows', () => {
  const rows = [{ id: '1', name: 'Squat' }, { id: '2', name: 'bench' }, { id: '3', name: 'Curl' }, { id: '4', name: 'Row' }, { id: '5', name: 'Dip' }];
  const prog: Record<string, GoalProgress> = { '1': { pct: 40, reached: false }, '2': { pct: 80, reached: false }, '3': { pct: 100, reached: true }, '4': null, '5': { pct: 80, reached: false } };
  it('defaults to name', () => { expect(DEFAULT_WEIGHT_GOAL_SORT).toBe('name'); expect(sortWeightGoalRows(rows, 'name', id => prog[id]).map(r => r.id)).toEqual(['2', '3', '5', '4', '1']); });
  it('closest: nearest open goal first, ties by name, then reached, then nothing to measure', () => {
    expect(sortWeightGoalRows(rows, 'closest', id => prog[id]).map(r => r.id)).toEqual(['2', '5', '1', '3', '4']);
  });
});

describe('sortFreqRows', () => {
  const name: Record<string, string> = { a: 'Squat', b: 'bench', c: 'Curl', d: 'Dip' };
  const rows = [{ id: 'a', goal: 3, done: 1, met: false }, { id: 'b', goal: 2, done: 1, met: false }, { id: 'c', goal: 2, done: 2, met: true }, { id: 'd', goal: 4, done: 2, met: false }];
  const nameOf = (id: string) => name[id];
  it('not met first keeps the order given', () => { expect(DEFAULT_FREQ_GOAL_SORT).toBe('open'); expect(sortFreqRows(rows, 'open', nameOf)).toEqual(rows); });
  it('name sorts ignoring case', () => expect(sortFreqRows(rows, 'name', nameOf).map(r => r.id)).toEqual(['b', 'c', 'd', 'a']));
  it('closest: unmet by share done (ties by name), met last', () => expect(sortFreqRows(rows, 'closest', nameOf).map(r => r.id)).toEqual(['b', 'd', 'a', 'c']));
});
