import { describe, expect, it } from 'vitest';
import { editProfile, yearFeedback } from './profileEdit.js';

const now = 2026;
describe('yearFeedback', () => {
  it('lets an empty box through, rejects what is not a four-digit year in range, and notes a year under 19', () => {
    expect(yearFeedback('', now)).toEqual({ error: '', note: '' });
    expect(yearFeedback('1985', now)).toEqual({ error: '', note: '' });
    expect(yearFeedback('85', now).error).toMatch(/four-digit/);
    expect(yearFeedback('19x5', now).error).toMatch(/four-digit/);
    expect(yearFeedback('1850', now).error).toBe('Enter a year from 1900 to 2026.');
    expect(yearFeedback('2030', now).error).toBe('Enter a year from 1900 to 2026.');
    expect(yearFeedback('2010', now)).toEqual({ error: '', note: 'Amounts are shown for ages 19 and over, so the adult range is used.' });
    expect(yearFeedback('2007', now).note).toBe('');
  });
});

describe('editProfile', () => {
  it('builds the profile one field at a time', () => {
    const a = editProfile(undefined, { year: '1985' }, now);
    expect(a).toEqual({ birthYear: 1985 });
    expect(editProfile(a, { sex: 'female' }, now)).toEqual({ birthYear: 1985, sex: 'female' });
  });
  it('Prefer not to say and an emptied year remove just that field, and nothing left is undefined', () => {
    const both = { birthYear: 1985, sex: 'male' as const };
    expect(editProfile(both, { sex: 'none' }, now)).toEqual({ birthYear: 1985 });
    expect(editProfile(both, { year: '' }, now)).toEqual({ sex: 'male' });
    expect(editProfile({ sex: 'male' }, { sex: 'none' }, now)).toBeUndefined();
  });
  it('an unusable year leaves the saved one alone', () => {
    expect(editProfile({ birthYear: 1985 }, { year: '19' }, now)).toEqual({ birthYear: 1985 });
    expect(editProfile({ birthYear: 1985 }, { year: '3000' }, now)).toEqual({ birthYear: 1985 });
  });
});
