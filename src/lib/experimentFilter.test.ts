import { describe, expect, it } from 'vitest';
import { FILTER_AT, hasFilter, matchesMuscle, matchesQuery, matchesStatus, musclesPresent, statusLabel, muscleKeys, cardMuscles } from './experimentFilter.js';

describe('experiment list filter', () => {
  it('shows the search only above the threshold', () => {
    expect(hasFilter(FILTER_AT)).toBe(false);
    expect(hasFilter(FILTER_AT + 1)).toBe(true);
  });
  it('matches the name or the note, ignoring case and spacing', () => {
    expect(matchesQuery('', 'Hack Squat')).toBe(true);
    expect(matchesQuery('  ', 'Hack Squat')).toBe(true);
    expect(matchesQuery('hack  SQ', 'Hack Squat', 'light')).toBe(true);
    expect(matchesQuery('light', 'Hack Squat', 'Try light')).toBe(true);
    expect(matchesQuery('cable', 'Hack Squat', 'Try light')).toBe(false);
    expect(matchesQuery('x', 'Hack Squat', undefined)).toBe(false);
  });
});

describe('Ideas to try status and muscle', () => {
  const none = { onDays: [] as number[], neverLogged: true };
  const onDay = { onDays: [2, 4], neverLogged: true };
  const logged = { onDays: [] as number[], neverLogged: false };
  it('matches each status on its own', () => {
    expect(matchesStatus('', onDay)).toBe(true);
    expect(matchesStatus('noday', none)).toBe(true);
    expect(matchesStatus('noday', onDay)).toBe(false);
    expect(matchesStatus('onday', onDay)).toBe(true);
    expect(matchesStatus('onday', none)).toBe(false);
    expect(matchesStatus('neverlogged', onDay)).toBe(true); // independent: on a day and never logged matches both
    expect(matchesStatus('neverlogged', logged)).toBe(false);
  });
  it('labels a card by days, then never logged, then not on a day', () => {
    expect(statusLabel(onDay)).toBe('On Day 2, 4');
    expect(statusLabel(none)).toBe('Never logged');
    expect(statusLabel(logged)).toBe('Not on a day yet');
  });
  it('matches a muscle, and an untagged idea only under All', () => {
    expect(matchesMuscle('', [])).toBe(true);
    expect(matchesMuscle('quads', [])).toBe(false);
    expect(matchesMuscle('quads', ['glutes', 'quads'])).toBe(true);
  });
  it('lists only muscles present, in the given order', () => {
    expect(musclesPresent([['quads'], [], ['chest', 'quads']], ['chest', 'back', 'quads'])).toEqual(['chest', 'quads']);
    expect(musclesPresent([[]], ['chest'])).toEqual([]);
  });
  it('lists primary then secondary muscles, and the first two primary on a card', () => {
    expect(muscleKeys({ p: ['quads'], s: ['glutes'] })).toEqual(['quads', 'glutes']);
    expect(muscleKeys(null)).toEqual([]);
    expect(cardMuscles({ p: ['a', 'b', 'c'] })).toEqual(['a', 'b']);
    expect(cardMuscles(undefined)).toEqual([]);
  });
});
