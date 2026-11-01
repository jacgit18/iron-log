import { describe, it, expect } from 'vitest';
import { sortExerciseRows } from './exerciseSort.js';

const rows = [{ id: 'c', name: 'Curl' }, { id: 'a', name: 'bench' }, { id: 'd', name: 'Dip' }, { id: 'b', name: 'Bench' }];
const e = (d: string) => ({ d });
const logs = { c: [e('2026-10-01'), e('2026-10-20')], d: [e('2026-10-25')], b: [e('2026-09-01'), e('2026-09-02'), e('2026-09-03')] };
const ids = (s: Parameters<typeof sortExerciseRows>[1]) => sortExerciseRows(rows, s, logs).map(r => r.id);

describe('exercise library sort', () => {
  it('name: case-blind, equal names by id', () => expect(ids('name')).toEqual(['a', 'b', 'c', 'd']));
  it('used: most logged first, never logged last, ties by name', () => expect(ids('used')).toEqual(['b', 'c', 'd', 'a']));
  it('last: newest log first, never logged last', () => expect(ids('last')).toEqual(['d', 'c', 'b', 'a']));
  it('does not change the input and handles no logs', () => {
    const copy = [...rows];
    expect(sortExerciseRows(rows, 'last', {}).map(r => r.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(rows).toEqual(copy);
  });
});
