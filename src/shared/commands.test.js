import { describe, it, expect } from 'vitest';
import { validateLogSession, validateTickCard, validateUntickCard, validateDeleteEntry } from './commands.js';

describe('validateLogSession', () => {
  it('accepts an exercise id with a valid entry and cleans the entry', () => {
    const out = validateLogSession({ exerciseId: 'squat', entry: { d: '2026-10-07', w: '135', s: 3, junk: 1 } });
    expect(out).toEqual({ exerciseId: 'squat', entry: { d: '2026-10-07', w: 135, s: 3 } });
  });
  it('refuses a missing or oversized exercise id', () => {
    expect(validateLogSession({ entry: { d: '2026-10-07' } })).toBeNull();
    expect(validateLogSession({ exerciseId: 'x'.repeat(101), entry: { d: '2026-10-07' } })).toBeNull();
  });
  it('refuses an entry with no valid date, and non-objects', () => {
    expect(validateLogSession({ exerciseId: 'squat', entry: { d: 'nope' } })).toBeNull();
    expect(validateLogSession(null)).toBeNull();
  });
});

describe('validateTickCard', () => {
  const tick = { d: '2026-10-07', w: 135, s: 3, r: 5, slot: 'A-d1s1', wk: '2026-10-04', auto: true };
  it('accepts a check-off with a slot and a week', () => {
    expect(validateTickCard({ exerciseId: 'squat', entry: tick })).toEqual({ exerciseId: 'squat', entry: tick });
  });
  it('refuses an entry that is not marked auto, or has no slot or week', () => {
    expect(validateTickCard({ exerciseId: 'squat', entry: { ...tick, auto: false } })).toBeNull();
    expect(validateTickCard({ exerciseId: 'squat', entry: { ...tick, slot: undefined } })).toBeNull();
    expect(validateTickCard({ exerciseId: 'squat', entry: { ...tick, wk: undefined } })).toBeNull();
  });
});

describe('validateUntickCard', () => {
  it('accepts a card and week, with optional exercise and removeLogged', () => {
    expect(validateUntickCard({ slot: 's1', wk: '2026-10-04' })).toEqual({ slot: 's1', wk: '2026-10-04' });
    expect(validateUntickCard({ slot: 's1', wk: '2026-10-04', exerciseId: 'squat', removeLogged: true, junk: 1 })).toEqual({ slot: 's1', wk: '2026-10-04', exerciseId: 'squat', removeLogged: true });
  });
  it('refuses a missing slot, a bad week, and wrong types', () => {
    expect(validateUntickCard({ wk: '2026-10-04' })).toBeNull();
    expect(validateUntickCard({ slot: 's1', wk: 'nope' })).toBeNull();
    expect(validateUntickCard({ slot: 's1', wk: '2026-10-04', exerciseId: '' })).toBeNull();
    expect(validateUntickCard({ slot: 's1', wk: '2026-10-04', removeLogged: 'yes' })).toBeNull();
    expect(validateUntickCard(null)).toBeNull();
  });
});

describe('validateDeleteEntry', () => {
  it('accepts an entry id and drops other fields', () => {
    expect(validateDeleteEntry({ entryId: 'L1', junk: 1 })).toEqual({ entryId: 'L1' });
  });
  it('refuses a missing, empty, oversized or non-string id, and non-objects', () => {
    expect(validateDeleteEntry({})).toBeNull();
    expect(validateDeleteEntry({ entryId: '' })).toBeNull();
    expect(validateDeleteEntry({ entryId: 'x'.repeat(101) })).toBeNull();
    expect(validateDeleteEntry({ entryId: 5 })).toBeNull();
    expect(validateDeleteEntry(null)).toBeNull();
  });
});
