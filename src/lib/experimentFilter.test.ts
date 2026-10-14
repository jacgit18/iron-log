import { describe, expect, it } from 'vitest';
import { FILTER_AT, hasFilter, matchesQuery } from './experimentFilter.js';

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
