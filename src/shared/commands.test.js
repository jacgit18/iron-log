import { describe, it, expect } from 'vitest';
import { validateLogSession, validateTickCard, validateUntickCard, validateDeleteEntry, validateLogBodyWeight, validateDeleteBodyWeight, validateSaveWeek, validateSaveStretchWeek, validateDeleteWeek } from './commands.js';

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

describe('validateLogBodyWeight', () => {
  it('accepts a week, a day and a weight, and cleans the entry', () => {
    expect(validateLogBodyWeight({ wk: '2026-10-04', d: '2026-10-07', w: '180.5', junk: 1, updatedAt: '2026-10-07T12:00:00Z' })).toEqual({ wk: '2026-10-04', d: '2026-10-07', w: 180.5 });
  });
  it('refuses a bad date, a missing or out-of-range weight, and non-objects', () => {
    expect(validateLogBodyWeight({ wk: 'nope', d: '2026-10-07', w: 180 })).toBeNull();
    expect(validateLogBodyWeight({ wk: '2026-10-04', d: 'nope', w: 180 })).toBeNull();
    expect(validateLogBodyWeight({ wk: '2026-10-04', d: '2026-10-07' })).toBeNull();
    expect(validateLogBodyWeight({ wk: '2026-10-04', d: '2026-10-07', w: 0 })).toBeNull();
    expect(validateLogBodyWeight({ wk: '2026-10-04', d: '2026-10-07', w: 1500 })).toBeNull();
    expect(validateLogBodyWeight(null)).toBeNull();
  });
});

describe('validateDeleteBodyWeight', () => {
  it('accepts a week and drops other fields', () => {
    expect(validateDeleteBodyWeight({ wk: '2026-10-04', junk: 1 })).toEqual({ wk: '2026-10-04' });
  });
  it('refuses a missing or bad week, and non-objects', () => {
    expect(validateDeleteBodyWeight({})).toBeNull();
    expect(validateDeleteBodyWeight({ wk: '2026-13-40' })).toBeNull();
    expect(validateDeleteBodyWeight(null)).toBeNull();
  });
});

describe('validateSaveWeek', () => {
  it('accepts a week start and cleans the week', () => {
    const out = validateSaveWeek({ weekStart: '2026-10-04', week: { prog: 'A', done: { 'A-d1s1:0': true, bad: 0 }, junk: 1 } });
    expect(out.weekStart).toBe('2026-10-04');
    expect(out.week).toMatchObject({ prog: 'A', done: { 'A-d1s1:0': true }, skipped: {}, moved: {}, ph: {}, warm: {} });
    expect(out.week.junk).toBeUndefined();
  });
  it('refuses a bad week start, a missing week and non-objects', () => {
    expect(validateSaveWeek({ weekStart: 'nope', week: {} })).toBeNull();
    expect(validateSaveWeek({ weekStart: '2026-10-04' })).toBeNull();
    expect(validateSaveWeek({ weekStart: '2026-10-04', week: 'x' })).toBeNull();
    expect(validateSaveWeek(null)).toBeNull();
  });
});

describe('validateSaveStretchWeek', () => {
  it('accepts a week start and cleans the stretch week', () => {
    const out = validateSaveStretchWeek({ weekStart: '2026-10-04', week: { done: { '0:scarecrow': true, 'x:bad': true }, skipped: { 2: true }, junk: 1 } });
    expect(out).toEqual({ weekStart: '2026-10-04', week: { done: { '0:scarecrow': true }, skipped: { 2: true }, extra: [] } });
  });
  it('refuses a bad week start or a missing week', () => {
    expect(validateSaveStretchWeek({ weekStart: '2026-13-01', week: {} })).toBeNull();
    expect(validateSaveStretchWeek({ weekStart: '2026-10-04' })).toBeNull();
  });
});

describe('validateDeleteWeek', () => {
  it('accepts a week start and drops other fields', () => {
    expect(validateDeleteWeek({ weekStart: '2026-10-04', junk: 1 })).toEqual({ weekStart: '2026-10-04' });
  });
  it('refuses a missing or bad week start', () => {
    expect(validateDeleteWeek({})).toBeNull();
    expect(validateDeleteWeek({ weekStart: 'nope' })).toBeNull();
    expect(validateDeleteWeek(null)).toBeNull();
  });
});
